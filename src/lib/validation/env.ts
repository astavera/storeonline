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
  ADMIN_SESSION_SECRET: z.string().optional()
});

export const env = envSchema.parse(process.env);
