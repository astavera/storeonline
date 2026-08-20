/** Sends completed split checkouts to OrderPRO through an authenticated idempotent boundary. */

import "server-only";

import { z } from "zod";
import {
  orderProPaidCheckoutResponseSchema,
  orderProPaidCheckoutSchema,
  type OrderProPaidCheckout
} from "@/features/checkout/orderpro-paid-checkout-contract";

const configurationSchema = z.object({
  ORDERPRO_STOREFRONT_CHECKOUT_BASE_URL: z.string().url(),
  ORDERPRO_STOREFRONT_CHECKOUT_SHARED_SECRET: z.string().min(32)
});

const maxResponseBytes = 128 * 1024;

export function getOrderProPaidCheckoutClient(environment: Record<string, string | undefined> = process.env) {
  const parsed = configurationSchema.safeParse(environment);
  if (!parsed.success) return null;
  const url = new URL(parsed.data.ORDERPRO_STOREFRONT_CHECKOUT_BASE_URL);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
  return createOrderProPaidCheckoutClient({
    baseUrl: url.origin,
    sharedSecret: parsed.data.ORDERPRO_STOREFRONT_CHECKOUT_SHARED_SECRET
  });
}

export function createOrderProPaidCheckoutClient(input: {
  baseUrl: string;
  sharedSecret: string;
  fetchImpl?: typeof fetch;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  return {
    async ingest(checkout: OrderProPaidCheckout) {
      const parsed = orderProPaidCheckoutSchema.parse(checkout);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await fetchImpl(`${input.baseUrl}/api/internal/storefront/paid-checkouts`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-orderpro-checkout-key": input.sharedSecret,
            "idempotency-key": `square-payment:${parsed.square.paymentId}`,
            "x-correlation-id": `checkout:${parsed.checkoutAttemptId}`
          },
          body: JSON.stringify(parsed),
          cache: "no-store",
          redirect: "error",
          signal: controller.signal
        });
        const raw = await response.text();
        if (new TextEncoder().encode(raw).byteLength > maxResponseBytes) throw new Error("ORDERPRO_CHECKOUT_RESPONSE_TOO_LARGE");
        if (!response.ok) {
          let code = `ORDERPRO_CHECKOUT_HTTP_${response.status}`;
          try {
            const error = JSON.parse(raw) as { code?: unknown };
            if (typeof error.code === "string" && /^[A-Z0-9_]+$/.test(error.code)) code = error.code;
          } catch {
            // Preserve the HTTP-derived error when the body is not valid JSON.
          }
          throw new Error(code);
        }
        return orderProPaidCheckoutResponseSchema.parse(JSON.parse(raw));
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
