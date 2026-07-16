import type { Prisma } from "@prisma/client";

export function toPrismaJson(value: unknown): Prisma.InputJsonValue {
  const serialized = JSON.stringify(value, (_key, nestedValue) => typeof nestedValue === "bigint" ? nestedValue.toString() : nestedValue);

  if (serialized === undefined) {
    throw new TypeError("Prisma JSON payload must be serializable.");
  }

  return JSON.parse(serialized) as Prisma.InputJsonValue;
}
