/** Permissioned customer notes and privacy-request workflow. No automatic deletion is performed. */

import "server-only";

import { recordAdminAuditEvent } from "@/server/admin/admin-audit-service";
import { getPrismaClient } from "@/server/db/prisma";

export async function readAdminCustomerPrivacyProfile(customerId: string) {
  return getPrismaClient().customerAccount.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      notes: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, body: true, createdAt: true, authorAdminUser: { select: { displayName: true, email: true } } }
      },
      privacyRequests: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, requestType: true, status: true, resolutionNote: true, createdAt: true, updatedAt: true, completedAt: true }
      }
    }
  }).then((profile) => profile ? ({
    ...profile,
    displayName: [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "No name provided",
    notes: profile.notes.map(({ authorAdminUser, ...note }) => ({ ...note, createdAt: note.createdAt.toISOString(), author: authorAdminUser?.displayName || authorAdminUser?.email || "Former administrator" })),
    privacyRequests: profile.privacyRequests.map((request) => ({ ...request, createdAt: request.createdAt.toISOString(), updatedAt: request.updatedAt.toISOString(), completedAt: request.completedAt?.toISOString() ?? null }))
  }) : null);
}

export type AdminCustomerPrivacyProfile = NonNullable<Awaited<ReturnType<typeof readAdminCustomerPrivacyProfile>>>;

export async function addAdminCustomerNote(input: { customerId: string; body: string; actorSubject: string }) {
  const body = input.body.trim();
  if (body.length < 2 || body.length > 2_000) throw new CustomerPrivacyError("INVALID_NOTE");
  const authorAdminUserId = await resolveAdminUserId(input.actorSubject);
  const note = await getPrismaClient().customerNote.create({ data: { customerAccountId: input.customerId, authorAdminUserId, body }, select: { id: true } });
  await recordAdminAuditEvent({ actorId: input.actorSubject, action: "CUSTOMER_NOTE_CREATED", entityType: "CustomerNote", entityId: note.id, after: { customerId: input.customerId, length: body.length } });
  return note;
}

export async function createAdminCustomerDeletionRequest(input: { customerId: string; actorSubject: string }) {
  const prisma = getPrismaClient();
  const existing = await prisma.customerPrivacyRequest.findFirst({ where: { customerAccountId: input.customerId, requestType: "DELETION", status: { in: ["REQUESTED", "IN_REVIEW"] } }, select: { id: true } });
  if (existing) throw new CustomerPrivacyError("OPEN_REQUEST_EXISTS");
  const requestedById = await resolveAdminUserId(input.actorSubject);
  const request = await prisma.customerPrivacyRequest.create({ data: { customerAccountId: input.customerId, requestType: "DELETION", requestedById }, select: { id: true, status: true } });
  await recordAdminAuditEvent({ actorId: input.actorSubject, action: "CUSTOMER_DELETION_REQUESTED", entityType: "CustomerPrivacyRequest", entityId: request.id, after: { customerId: input.customerId, status: request.status, automaticDeletion: false } });
  return request;
}

export async function updateAdminCustomerPrivacyRequest(input: { requestId: string; status: "IN_REVIEW" | "COMPLETED" | "REJECTED"; resolutionNote: string; actorSubject: string }) {
  const resolutionNote = input.resolutionNote.trim();
  if (resolutionNote.length < 3 || resolutionNote.length > 1_000) throw new CustomerPrivacyError("INVALID_RESOLUTION");
  const resolvedById = await resolveAdminUserId(input.actorSubject);
  const before = await getPrismaClient().customerPrivacyRequest.findUnique({ where: { id: input.requestId }, select: { status: true, resolutionNote: true } });
  if (!before) throw new CustomerPrivacyError("NOT_FOUND");
  const request = await getPrismaClient().customerPrivacyRequest.update({ where: { id: input.requestId }, data: { status: input.status, resolutionNote, resolvedById, completedAt: input.status === "COMPLETED" ? new Date() : null }, select: { id: true, status: true } });
  await recordAdminAuditEvent({ actorId: input.actorSubject, action: "CUSTOMER_PRIVACY_REQUEST_UPDATED", entityType: "CustomerPrivacyRequest", entityId: request.id, before, after: { status: request.status, resolutionNote } });
  return request;
}

export async function createAdminCustomerDataExport(input: { customerId: string; actorSubject: string }) {
  const prisma = getPrismaClient();
  const customer = await prisma.customerAccount.findUnique({
    where: { id: input.customerId },
    select: {
      id: true, email: true, firstName: true, lastName: true, termsAcceptedAt: true, termsVersion: true,
      marketingEmailConsent: true, marketingConsentAt: true, marketingConsentSource: true, marketingConsentVersion: true,
      marketingUnsubscribedAt: true, lastLoginAt: true, createdAt: true, updatedAt: true,
      consentEvents: { orderBy: { occurredAt: "asc" }, select: { consentType: true, granted: true, source: true, policyVersion: true, occurredAt: true } }
    }
  });
  if (!customer) throw new CustomerPrivacyError("NOT_FOUND");
  const orders = await prisma.orderMirror.findMany({ where: { customerEmail: { equals: customer.email, mode: "insensitive" } }, orderBy: { createdAt: "desc" }, take: 500, select: { squareOrderId: true, status: true, fulfillmentType: true, createdAt: true, updatedAt: true } });
  const requestedById = await resolveAdminUserId(input.actorSubject);
  const request = await prisma.customerPrivacyRequest.create({ data: { customerAccountId: input.customerId, requestType: "DATA_EXPORT", status: "COMPLETED", requestedById, resolvedById: requestedById, resolutionNote: "Generated by Store Admin; excludes credentials, payment data, internal notes, and external-system records.", completedAt: new Date() }, select: { id: true } });
  await recordAdminAuditEvent({ actorId: input.actorSubject, action: "CUSTOMER_DATA_EXPORTED", entityType: "CustomerPrivacyRequest", entityId: request.id, after: { customerId: input.customerId, orderCount: orders.length, truncated: orders.length === 500 } });
  return {
    generatedAt: new Date().toISOString(),
    requestId: request.id,
    scope: "Store Admin local data only",
    exclusions: ["session and challenge secrets", "payment data", "internal support notes", "Square and Operations records not mirrored locally"],
    customer: { ...customer, termsAcceptedAt: customer.termsAcceptedAt.toISOString(), marketingConsentAt: customer.marketingConsentAt?.toISOString() ?? null, marketingUnsubscribedAt: customer.marketingUnsubscribedAt?.toISOString() ?? null, lastLoginAt: customer.lastLoginAt?.toISOString() ?? null, createdAt: customer.createdAt.toISOString(), updatedAt: customer.updatedAt.toISOString(), consentEvents: customer.consentEvents.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })) },
    orders: orders.map((order) => ({ ...order, createdAt: order.createdAt.toISOString(), updatedAt: order.updatedAt.toISOString() })),
    ordersTruncated: orders.length === 500
  };
}

async function resolveAdminUserId(subject: string) {
  const user = await getPrismaClient().adminUser.findFirst({ where: { OR: [{ id: subject }, { email: subject.toLowerCase() }] }, select: { id: true } });
  return user?.id ?? null;
}

export class CustomerPrivacyError extends Error {
  constructor(readonly code: "INVALID_NOTE" | "OPEN_REQUEST_EXISTS" | "INVALID_RESOLUTION" | "NOT_FOUND") {
    super(code === "OPEN_REQUEST_EXISTS" ? "An open deletion request already exists." : code === "NOT_FOUND" ? "The customer or privacy request was not found." : "The privacy request is invalid.");
  }
}
