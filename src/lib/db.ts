import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/**
 * Tras `prisma generate`, HMR puede conservar un PrismaClient antiguo en
 * globalThis sin los nuevos delegates (p. ej. creditReport). Lo descartamos.
 */
function needsFreshClient(client: PrismaClient | undefined): boolean {
  if (!client) return true;
  const delegate = (client as unknown as Record<string, { findMany?: unknown }>)
    .creditReport;
  return typeof delegate?.findMany !== "function";
}

const existing = globalForPrisma.prisma;
export const prisma = needsFreshClient(existing)
  ? createPrismaClient()
  : existing!;

if (process.env.NODE_ENV !== "production") {
  if (existing && existing !== prisma) {
    void existing.$disconnect().catch(() => undefined);
  }
  globalForPrisma.prisma = prisma;
}

export const db = prisma;
