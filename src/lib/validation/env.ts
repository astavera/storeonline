import "server-only";
import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  DIRECT_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().min(1).optional()),
  SQUARE_ENVIRONMENT: z.enum(["sandbox", "production"]).default("sandbox"),
  SQUARE_ALLOW_PRODUCTION_READONLY_SYNC: z.enum(["true", "false"]).default("false"),
  SQUARE_ACCESS_TOKEN: z.string().optional(),
  SQUARE_APPLICATION_ID: z.string().optional(),
  NEXT_PUBLIC_SQUARE_APPLICATION_ID: z.string().optional(),
  NEXT_PUBLIC_SQUARE_LOCATION_ID: z.string().optional(),
  SQUARE_WEBHOOK_SIGNATURE_KEY: z.string().optional(),
  WEBHOOK_WORKER_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().min(32).optional()),
  SHIPPO_API_TOKEN: z.string().optional(),
  MAPBOX_ACCESS_TOKEN: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  ADMIN_SESSION_SECRET: z.preprocess((value) => value === "" ? undefined : value, z.string().min(32).optional()),
  ADMIN_LOGIN_EMAIL: z.preprocess((value) => value === "" ? undefined : value, z.string().email().optional()),
  ADMIN_PASSWORD_HASH: z.preprocess((value) => value === "" ? undefined : value, z.string().startsWith("scrypt-v1$").optional()),
  ADMIN_ALLOWED_ORIGINS: z.string().optional(),
  ADMIN_DEV_BYPASS: z.enum(["true", "false"]).default("false"),
  ORDERPRO_ADMIN_URL: z.preprocess((value) => value === "" ? undefined : value, z.string().url().optional()),
  ORDERPRO_M2M_AUTH_MODE: z.string().optional(),
  ORDERPRO_INTEGRATION_ENVIRONMENT: z.string().optional(),
  ORDERPRO_API_BASE_URL: z.string().optional(),
  ORDERPRO_AUTH0_ISSUER: z.string().optional(),
  ORDERPRO_AUTH0_AUDIENCE: z.string().optional(),
  ORDERPRO_AUTH0_CLIENT_ID: z.string().optional(),
  ORDERPRO_AUTH0_CLIENT_SECRET: z.string().optional(),
  ORDERPRO_AUTH0_SCOPES: z.string().optional(),
  ORDERPRO_LOCAL_DELIVERY_CHECKOUT_ENABLED: z.string().optional(),
  ALLOW_LOCAL_PERSISTENCE_FALLBACK: z.enum(["true", "false"]).default("false")
});

export const env = envSchema.parse(process.env);
