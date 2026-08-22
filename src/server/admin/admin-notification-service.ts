/** Versioned transactional notification templates; sending is provider-gated. */

import "server-only";

import { createHmac } from "node:crypto";
import { getPrismaClient } from "@/server/db/prisma";
import { recordAdminAuditEvent } from "@/server/admin/admin-audit-service";

export const adminNotificationDefinitions = [
  { key: "ORDER_CONFIRMATION", name: "Order confirmation", variables: ["order_number", "order_total"] },
  { key: "READY_FOR_PICKUP", name: "Ready for pickup", variables: ["order_number", "location_name", "pickup_time"] },
  { key: "ORDER_PICKED_UP", name: "Order picked up", variables: ["order_number"] },
  { key: "SHIPPING_CONFIRMATION", name: "Shipping confirmation", variables: ["order_number", "tracking_number", "tracking_url"] },
  { key: "DELIVERY_CONFIRMATION", name: "Delivery confirmation", variables: ["order_number"] },
  { key: "RETURN_UPDATE", name: "Return update", variables: ["rma_number", "order_number", "return_status"] },
  { key: "REFUND_UPDATE", name: "Refund update", variables: ["rma_number", "refund_amount", "refund_status"] },
  { key: "INTERNAL_FAILURE", name: "Internal failure alert", variables: ["alert_type", "reference"] }
] as const;

export type AdminNotificationKey = (typeof adminNotificationDefinitions)[number]["key"];

export async function readAdminNotificationWorkspace() {
  const providerReady = process.env.ADMIN_TRANSACTIONAL_NOTIFICATION_PROVIDER === "RESEND"
    && Boolean(process.env.RESEND_API_KEY?.trim() && process.env.CUSTOMER_AUTH_EMAIL_FROM?.trim() && process.env.ADMIN_RECOVERY_CODE_PEPPER?.trim());
  if (!process.env.DATABASE_URL) return { available: false, providerReady, provider: providerReady ? "Resend" : "Not configured", definitions: adminNotificationDefinitions, templates: [], deliveries: [] };
  try {
    const prisma = getPrismaClient();
    const [versions, deliveries] = await Promise.all([
      prisma.notificationTemplateVersion.findMany({ orderBy: [{ templateKey: "asc" }, { version: "desc" }] }),
      prisma.notificationDeliveryEvent.findMany({ orderBy: { createdAt: "desc" }, take: 25, select: { id: true, eventType: true, channel: true, provider: true, status: true, errorCode: true, createdAt: true } })
    ]);
    const latest = new Map<string, typeof versions[number]>();
    for (const version of versions) if (!latest.has(version.templateKey)) latest.set(version.templateKey, version);
    return {
      available: true,
      providerReady,
      provider: providerReady ? "Resend" : "Not configured",
      definitions: adminNotificationDefinitions,
      templates: [...latest.values()].map((template) => ({ ...template, publishedAt: template.publishedAt?.toISOString() ?? null, createdAt: template.createdAt.toISOString(), updatedAt: template.updatedAt.toISOString() })),
      deliveries: deliveries.map((delivery) => ({ ...delivery, createdAt: delivery.createdAt.toISOString() }))
    };
  } catch (error) {
    console.warn("[admin-notifications] Could not read templates.", error);
    return { available: false, providerReady, provider: providerReady ? "Resend" : "Not configured", definitions: adminNotificationDefinitions, templates: [], deliveries: [] };
  }
}

export async function saveAdminNotificationTemplate(input: { key: AdminNotificationKey; subject: string; bodyText: string; publish: boolean; actorSubject: string }) {
  const definition = adminNotificationDefinitions.find((item) => item.key === input.key);
  if (!definition) throw new AdminNotificationError("INVALID_TEMPLATE");
  const subject = input.subject.trim();
  const bodyText = input.bodyText.trim();
  if (!subject || subject.length > 180 || !bodyText || bodyText.length > 10_000) throw new AdminNotificationError("INVALID_CONTENT");
  validateVariables(`${subject}\n${bodyText}`, definition.variables);
  const prisma = getPrismaClient();
  const saved = await prisma.$transaction(async (transaction) => {
    const latest = await transaction.notificationTemplateVersion.aggregate({ where: { templateKey: input.key }, _max: { version: true } });
    await transaction.notificationTemplateVersion.updateMany({ where: { templateKey: input.key, status: input.publish ? "PUBLISHED" : "DRAFT" }, data: { status: "ARCHIVED" } });
    return transaction.notificationTemplateVersion.create({
      data: {
        templateKey: input.key,
        version: (latest._max.version ?? 0) + 1,
        name: definition.name,
        subject,
        bodyText,
        variables: [...definition.variables],
        status: input.publish ? "PUBLISHED" : "DRAFT",
        publishedAt: input.publish ? new Date() : null
      }
    });
  });
  await recordAdminAuditEvent({ actorId: input.actorSubject, action: input.publish ? "NOTIFICATION_TEMPLATE_PUBLISHED" : "NOTIFICATION_TEMPLATE_DRAFTED", entityType: "NotificationTemplateVersion", entityId: saved.id, after: { templateKey: input.key, version: saved.version, status: saved.status } });
  return saved;
}

export async function sendAdminNotificationTest(input: { key: AdminNotificationKey; email: string; actorSubject: string }) {
  if (process.env.ADMIN_TRANSACTIONAL_NOTIFICATION_PROVIDER !== "RESEND" || !process.env.RESEND_API_KEY?.trim() || !process.env.CUSTOMER_AUTH_EMAIL_FROM?.trim() || !process.env.ADMIN_RECOVERY_CODE_PEPPER?.trim()) {
    throw new AdminNotificationError("PROVIDER_UNAVAILABLE");
  }
  const prisma = getPrismaClient();
  const template = await prisma.notificationTemplateVersion.findFirst({ where: { templateKey: input.key, status: { in: ["DRAFT", "PUBLISHED"] } }, orderBy: { version: "desc" } });
  if (!template) throw new AdminNotificationError("TEMPLATE_NOT_FOUND");
  const sample = sampleVariables(template.variables);
  const subject = renderTemplate(template.subject, sample);
  const bodyText = renderTemplate(template.bodyText, sample);
  const delivery = await prisma.notificationDeliveryEvent.create({ data: { templateVersionId: template.id, eventType: `${input.key}.TEST`, channel: "EMAIL", recipientHash: createHmac("sha256", process.env.ADMIN_RECOVERY_CODE_PEPPER).update(input.email.trim().toLowerCase()).digest("base64url"), provider: "RESEND", status: "QUEUED" } });
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`, "Content-Type": "application/json", "Idempotency-Key": `admin-notification-test-${delivery.id}` }, body: JSON.stringify({ from: process.env.CUSTOMER_AUTH_EMAIL_FROM.trim(), to: [input.email.trim().toLowerCase()], subject: `[TEST] ${subject}`, text: bodyText }) });
    if (!response.ok) throw new Error(`RESEND_HTTP_${response.status}`);
    const result = await response.json().catch(() => ({})) as { id?: string };
    await prisma.notificationDeliveryEvent.update({ where: { id: delivery.id }, data: { status: "SENT", providerMessageId: result.id?.slice(0, 255) } });
  } catch (error) {
    await prisma.notificationDeliveryEvent.update({ where: { id: delivery.id }, data: { status: "FAILED", errorCode: error instanceof Error ? error.message.slice(0, 80) : "SEND_FAILED" } });
    throw new AdminNotificationError("SEND_FAILED");
  }
  await recordAdminAuditEvent({ actorId: input.actorSubject, action: "NOTIFICATION_TEST_SENT", entityType: "NotificationTemplateVersion", entityId: template.id, after: { templateKey: input.key, deliveryId: delivery.id } });
  return { deliveryId: delivery.id };
}

function validateVariables(content: string, allowed: readonly string[]) {
  const variables = [...content.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/g)].map((match) => match[1]);
  if (variables.some((variable) => !allowed.includes(variable))) throw new AdminNotificationError("UNKNOWN_VARIABLE");
}
function sampleVariables(variables: string[]) { return Object.fromEntries(variables.map((variable) => [variable, `sample_${variable}`])); }
function renderTemplate(value: string, variables: Record<string, string>) { return value.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_match, key: string) => variables[key] ?? ""); }

export class AdminNotificationError extends Error {
  constructor(readonly code: "INVALID_TEMPLATE" | "INVALID_CONTENT" | "UNKNOWN_VARIABLE" | "PROVIDER_UNAVAILABLE" | "TEMPLATE_NOT_FOUND" | "SEND_FAILED") { super(code === "PROVIDER_UNAVAILABLE" ? "Transactional notification delivery is not configured." : "The notification request could not be completed."); }
}
