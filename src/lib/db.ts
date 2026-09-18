import { Prisma, PrismaClient } from "@prisma/client";

/**
 * Subir este número cuando se añadan modelos/campos Prisma.
 * Fuerza descartar el singleton de HMR/Turbopack que aún no tiene los delegates.
 */
const PRISMA_CLIENT_GENERATION = 10;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaClientGeneration?: number;
  prismaReconnect?: Promise<void> | null;
};

/** Hostinger cuota / max_connections: reintentar empeora el problema. */
function isConnectionQuotaError(error: unknown): boolean {
  const msg =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (
    msg.includes("max_connections") ||
    msg.includes("max_user_connections") ||
    msg.includes("1226") ||
    msg.includes("too many connections")
  ) {
    return true;
  }
  // MySQL SQLSTATE 42000 a menudo acompaña ERROR 1226 en el mensaje.
  if (msg.includes("42000") && msg.includes("resource")) return true;
  return false;
}

function isTransientConnectionError(error: unknown): boolean {
  if (isConnectionQuotaError(error)) return false;

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return (
      error.code === "P1017" ||
      error.code === "P1001" ||
      error.code === "P1002" ||
      error.code === "P1008" ||
      error.code === "P1011"
    );
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    const msg = error.message.toLowerCase();
    // No reintentar errores de config (p.ej. DATABASE_URL ausente / P1012).
    return (
      msg.includes("can't reach") ||
      msg.includes("timed out") ||
      msg.includes("econnrefused") ||
      msg.includes("connection refused") ||
      msg.includes("server has closed")
    );
  }
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    return (
      msg.includes("server has closed the connection") ||
      msg.includes("connection reset") ||
      msg.includes("can't reach database server") ||
      msg.includes("econnreset") ||
      msg.includes("socket hang up") ||
      msg.includes("connection timed out") ||
      msg.includes("closed the connection")
    );
  }
  return false;
}

async function reconnectClient(client: PrismaClient): Promise<void> {
  if (!globalForPrisma.prismaReconnect) {
    globalForPrisma.prismaReconnect = (async () => {
      await client.$disconnect().catch(() => undefined);
      await client.$connect();
    })().finally(() => {
      globalForPrisma.prismaReconnect = null;
    });
  }
  await globalForPrisma.prismaReconnect;
}

function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

  // Hostinger MySQL cierra conexiones idle → P1017. Reintento 1× tras reconnect.
  const extended = base.$extends({
    query: {
      async $allOperations({ args, query }) {
        try {
          return await query(args);
        } catch (error) {
          if (!isTransientConnectionError(error)) throw error;
          await reconnectClient(base);
          return await query(args);
        }
      },
    },
  });

  return extended as unknown as PrismaClient;
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
