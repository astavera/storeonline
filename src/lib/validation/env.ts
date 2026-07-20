import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  SQUARE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  SQUARE_ACCESS_TOKEN: z.string().optional(),
  SQUARE_APPLICATION_ID: z.string().optional(),
  NEXT_PUBLIC_SQUARE_APPLICATION_ID: z.string().optional(),
  NEXT_PUBLIC_SQUARE_LOCATION_ID: z.string().optional(),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),
  SHIPPO_API_TOKEN: z.string().optional(),
  MAPBOX_ACCESS_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  ADMIN_SESSION_SECRET: z.string().optional(),
  ORDERPRO_M2M_AUTH_MODE: z.string().optional(),
  ORDERPRO_INTEGRATION_ENVIRONMENT: z.string().optional(),
  ORDERPRO_API_BASE_URL: z.string().optional(),
  ORDERPRO_AUTH0_ISSUER: z.string().optional(),
  ORDERPRO_AUTH0_AUDIENCE: z.string().optional(),
  ORDERPRO_AUTH0_CLIENT_ID: z.string().optional(),
  ORDERPRO_AUTH0_CLIENT_SECRET: z.string().optional(),
  ORDERPRO_AUTH0_SCOPES: z.string().optional(),
  ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: z.string().optional()
});

export const env = envSchema.parse(process.env);
