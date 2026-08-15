/**
 * Implements server-side client behavior and persistence boundaries.
 */

import "server-only";
import { env } from "@/lib/validation/env";

export type SquareRuntimeConfig = {
  environment: "sandbox" | "production";
  hasAccessToken: boolean;
  hasApplicationId: boolean;
};

export function getSquareRuntimeConfig(): SquareRuntimeConfig {
  return {
    environment: env.SQUARE_ENVIRONMENT,
    hasAccessToken: Boolean(env.SQUARE_ACCESS_TOKEN),
    hasApplicationId: Boolean(env.SQUARE_APPLICATION_ID)
  };
}

export function assertSquareWriteAllowed() {
  if (env.SQUARE_ENVIRONMENT !== "sandbox") {
    throw new Error("Square write operations are disabled outside sandbox until explicitly approved.");
  }

  if (!env.SQUARE_ACCESS_TOKEN) {
    throw new Error("Square access token is not configured.");
  }
}
