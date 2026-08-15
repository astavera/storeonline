/**
 * Implements server-side admin rate limit behavior and persistence boundaries.
 */

import "server-only";

import { createHash } from "node:crypto";
import { getPrismaClient } from "@/server/db/prisma";
import { PersistenceUnavailableError, requireDatabaseOrDevelopmentFallback } from "@/server/db/persistence-policy";

export type AdminRateLimitInput = {
  key: string;
  scope: string;
  limit: number;
  windowMs: number;
  now?: number;
};

export type AdminRateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

export interface AdminRateLimiter {
  consume(input: AdminRateLimitInput): Promise<AdminRateLimitResult>;
}

export interface AdminRateLimitStore {
  increment(input: {
    scope: string;
    keyHash: string;
    windowStartedAt: Date;
    windowMs: number;
    expiresAt: Date;
  }): Promise<number>;
}

type RateBucket = { count: number; resetsAt: number };

export class InMemoryAdminRateLimiter implements AdminRateLimiter {
  private readonly buckets = new Map<string, RateBucket>();

  async consume(input: AdminRateLimitInput): Promise<AdminRateLimitResult> {
    validateInput(input);
    const now = input.now ?? Date.now();
    const bucketKey = `${input.scope}:${input.key}`;
    const current = this.buckets.get(bucketKey);
    const bucket = !current || current.resetsAt <= now ? { count: 0, resetsAt: fixedWindowEnd(now, input.windowMs) } : current;
    bucket.count += 1;
    this.buckets.set(bucketKey, bucket);
    return toResult(bucket.count, input.limit, bucket.resetsAt, now);
  }
}

export class PersistentAdminRateLimiter implements AdminRateLimiter {
  constructor(private readonly store: AdminRateLimitStore) {}

  async consume(input: AdminRateLimitInput): Promise<AdminRateLimitResult> {
    validateInput(input);
    const now = input.now ?? Date.now();
    const windowStartedAtMs = Math.floor(now / input.windowMs) * input.windowMs;
    const resetsAt = windowStartedAtMs + input.windowMs;
    const count = await this.store.increment({
      scope: input.scope,
      keyHash: createHash("sha256").update(input.key, "utf8").digest("hex"),
      windowStartedAt: new Date(windowStartedAtMs),
      windowMs: input.windowMs,
      expiresAt: new Date(resetsAt)
    });
    return toResult(count, input.limit, resetsAt, now);
  }
}

const prismaRateLimitStore: AdminRateLimitStore = {
  async increment(input) {
    try {
      const bucket = await getPrismaClient().adminRateLimitBucket.upsert({
        where: {
          scope_keyHash_windowStartedAt: {
            scope: input.scope,
            keyHash: input.keyHash,
            windowStartedAt: input.windowStartedAt
          }
        },
        create: input,
        update: { count: { increment: 1 }, expiresAt: input.expiresAt }
      });
      return bucket.count;
    } catch (error) {
      throw new PersistenceUnavailableError("Administrative rate limiting", { cause: error });
    }
  }
};

const persistentRateLimiter = new PersistentAdminRateLimiter(prismaRateLimitStore);
const developmentRateLimiter = new InMemoryAdminRateLimiter();
let overrideRateLimiter: AdminRateLimiter | undefined;

export function getAdminRateLimiter() {
  if (overrideRateLimiter) return overrideRateLimiter;
  return requireDatabaseOrDevelopmentFallback("Administrative rate limiting") === "database"
    ? persistentRateLimiter
    : developmentRateLimiter;
}

export function setAdminRateLimiter(nextRateLimiter: AdminRateLimiter | undefined) {
  overrideRateLimiter = nextRateLimiter;
}

function fixedWindowEnd(now: number, windowMs: number) {
  return (Math.floor(now / windowMs) + 1) * windowMs;
}

function toResult(count: number, limit: number, resetsAt: number, now: number): AdminRateLimitResult {
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((resetsAt - now) / 1000))
  };
}

function validateInput(input: AdminRateLimitInput) {
  if (!input.key.trim() || !input.scope.trim()) throw new TypeError("Rate limit key and scope are required.");
  if (!Number.isSafeInteger(input.limit) || input.limit < 1) throw new TypeError("Rate limit must be a positive integer.");
  if (!Number.isSafeInteger(input.windowMs) || input.windowMs < 1) throw new TypeError("Rate limit window must be a positive integer.");
}
