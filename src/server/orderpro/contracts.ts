import "server-only";
import { z } from "zod";
import { ORDERPRO_STAGING_SCOPES } from "@/server/orderpro/config";

export const ORDERPRO_STAGING_CLIENT_KEY = "storefront-staging";
export const ORDERPRO_MAX_RESPONSE_BYTES = 32 * 1024;

export const orderProAuthCheckSuccessSchema = z
  .object({
    result: z.literal("AUTHENTICATED"),
    clientId: z.literal(ORDERPRO_STAGING_CLIENT_KEY),
    environment: z.literal("STAGING"),
    scopes: z.tuple([z.literal(ORDERPRO_STAGING_SCOPES[0]), z.literal(ORDERPRO_STAGING_SCOPES[1])]),
    localDeliveryApiStatus: z.literal("DEPENDENCY_BLOCKED"),
    correlationId: z.string().uuid()
  })
  .strict();

export const orderProAuthCheckFailureSchema = z
  .discriminatedUnion("result", [
    z.object({ result: z.literal("UNAUTHORIZED"), code: z.literal("UNAUTHORIZED"), correlationId: z.string().uuid() }).strict(),
    z.object({ result: z.literal("FORBIDDEN"), code: z.literal("INSUFFICIENT_SCOPE"), correlationId: z.string().uuid() }).strict(),
    z.object({ result: z.literal("FAILED_CLOSED"), code: z.literal("M2M_AUTH_NOT_CONFIGURED"), correlationId: z.string().uuid() }).strict()
  ]);

export type OrderProAuthCheckSuccess = z.infer<typeof orderProAuthCheckSuccessSchema>;
export type OrderProAuthCheckFailure = z.infer<typeof orderProAuthCheckFailureSchema>;
