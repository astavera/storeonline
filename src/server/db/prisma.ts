import "server-only";

import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as typeof globalThis & {
  storeOnlinePrisma?: PrismaClient;
};

export function getPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for database-backed operations.");
  }

  if (!globalForPrisma.storeOnlinePrisma) {
    globalForPrisma.storeOnlinePrisma = new PrismaClient({
      log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
    });
  }

  return globalForPrisma.storeOnlinePrisma;
}

export async function disconnectPrismaClient() {
  if (!globalForPrisma.storeOnlinePrisma) {
    return;
  }

  await globalForPrisma.storeOnlinePrisma.$disconnect();
  globalForPrisma.storeOnlinePrisma = undefined;
}
