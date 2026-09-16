import { PrismaClient } from "@prisma/client";

/**
 * Subir este número cuando se añadan modelos/campos Prisma.
 * Fuerza descartar el singleton de HMR/Turbopack que aún no tiene los delegates.
 */
const PRISMA_CLIENT_GENERATION = 9;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClientGeneration?: number;
};

function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

function hasDelegate(client: PrismaClient, name: string): boolean {
  const delegate = (client as unknown as Record<string, { findMany?: unknown }>)[
    name
  ];
  return typeof delegate?.findMany === "function";
}

/** Modelos añadidos en sprints recientes — si faltan, el client está stale. */
const REQUIRED_DELEGATES = [
  "testimonial",
  "consultation",
  "paymentPlan",
  "opportunity",
  "creditProcessor",
  "clientProgressReport",
  "disputeLetter",
] as const;

function needsFreshClient(client: PrismaClient | undefined): boolean {
  if (!client) return true;
  if (globalForPrisma.prismaClientGeneration !== PRISMA_CLIENT_GENERATION) {
    return true;
  }
  return !REQUIRED_DELEGATES.every((name) => hasDelegate(client, name));
}

function getPrisma(): PrismaClient {
  const existing = globalForPrisma.prisma;
  if (!needsFreshClient(existing)) {
    return existing!;
  }

  const next = createPrismaClient();
  if (!REQUIRED_DELEGATES.every((name) => hasDelegate(next, name))) {
    throw new Error(
      "PrismaClient sin modelos recientes (consultation/paymentPlan/…). " +
        "Ejecuta `npx prisma generate`, borra `.next` y reinicia `next dev`.",
    );
  }

  if (existing && existing !== next) {
    void existing.$disconnect().catch(() => undefined);
  }
  globalForPrisma.prisma = next;
  globalForPrisma.prismaClientGeneration = PRISMA_CLIENT_GENERATION;
  return next;
}

/**
 * Proxy: en cada acceso revalida el singleton (Turbopack/HMR a veces conserva
 * un PrismaClient antiguo sin los delegates nuevos).
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export const db = prisma;
