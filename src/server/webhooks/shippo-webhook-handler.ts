/**
 * Applies verified Shippo tracking events to the RMA mirror. Carrier DELIVERED
 * maps only to DELIVERED_TO_WH01 and never initiates inspection or refund.
 */

import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";
import type { ReturnsStatus } from "@/features/returns/contracts";
import { getReturnsRepository, type ReturnsRepository } from "@/server/returns/return-repository";
import type { WebhookInboxRecord } from "@/server/webhooks/webhook-inbox";
import type { WebhookEventHandler } from "@/server/webhooks/webhook-processor";

const trackingStatusSchema = z.union([
  z.string(),
  z.object({
    status: z.string(),
    status_date: z.string().datetime().optional(),
    status_details: z.string().optional()
  }).passthrough()
]);

const shippoWebhookSchema = z.object({
  event: z.string().min(1),
  data: z.object({
    tracking_number: z.string().min(1),
    tracking_status: trackingStatusSchema
  }).passthrough()
}).passthrough();

export function parseShippoWebhook(payload: unknown) {
  const parsed = shippoWebhookSchema.parse(payload);
  const status = typeof parsed.data.tracking_status === "string"
    ? parsed.data.tracking_status
    : parsed.data.tracking_status.status;
  const occurredAt = typeof parsed.data.tracking_status === "string"
    ? new Date()
    : parsed.data.tracking_status.status_date
      ? new Date(parsed.data.tracking_status.status_date)
      : new Date();
  const providerOccurredAt = typeof parsed.data.tracking_status === "string"
    ? null
    : parsed.data.tracking_status.status_date ?? null;
  const eventId = createHash("sha256").update(JSON.stringify({
    event: parsed.event,
    trackingNumber: parsed.data.tracking_number,
    status,
    occurredAt: providerOccurredAt
  })).digest("hex");
  return {
    eventId,
    eventType: parsed.event,
    trackingNumber: parsed.data.tracking_number,
    trackingStatus: status.toUpperCase(),
    occurredAt
  };
}

export function createShippoWebhookHandler(repository: ReturnsRepository): WebhookEventHandler {
  return async function handleShippoWebhook(record: WebhookInboxRecord) {
    const event = parseShippoWebhook(record.payload);
    if (record.eventType !== "track_updated") return;
    const status = mapTrackingStatus(event.trackingStatus);
    if (!status) return;
    const request = await repository.findRequestByTrackingNumber(event.trackingNumber);
    if (!request) return;
    if (!canApplyCarrierStatus(request.status, status)) return;
    await repository.appendStatusEvent({
      requestId: request.id,
      status,
      source: "shippo",
      externalEventId: record.eventId,
      occurredAt: event.occurredAt,
      details: {
        trackingNumber: event.trackingNumber,
        carrierStatus: event.trackingStatus
      }
    });
  };
}

export const handleShippoWebhookEvent: WebhookEventHandler = async (record) => {
  const handler = createShippoWebhookHandler(getReturnsRepository());
  return handler(record);
};

function mapTrackingStatus(value: string): ReturnsStatus | null {
  if (value === "TRANSIT") return "IN_TRANSIT";
  if (value === "DELIVERED") return "DELIVERED_TO_WH01";
  if (value === "FAILURE" || value === "RETURNED") return "EXCEPTION";
  return null;
}

function canApplyCarrierStatus(current: ReturnsStatus, next: ReturnsStatus) {
  if (current === next) return true;
  const carrierControlled = new Set<ReturnsStatus>([
    "LABEL_CREATED",
    "DROPPED_OFF",
    "IN_TRANSIT",
    "DELIVERED_TO_WH01",
    "EXCEPTION"
  ]);
  if (!carrierControlled.has(current)) return false;
  if (next === "IN_TRANSIT") {
    return ["LABEL_CREATED", "DROPPED_OFF", "EXCEPTION"].includes(current);
  }
  if (next === "DELIVERED_TO_WH01") {
    return ["LABEL_CREATED", "DROPPED_OFF", "IN_TRANSIT", "EXCEPTION"].includes(current);
  }
  return current !== "DELIVERED_TO_WH01";
}
