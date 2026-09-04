import { prisma } from "@/src/lib/db";
import { RateLimitError } from "@/src/server/errors";

/**
 * Rate limit fijo por ventana usando MySQL (válido en Fluid Compute /
 * varias instancias sin Redis). Cada clave tiene su propia ventana.
 */
export async function assertRateLimit(options: {
  key: string;
  limit: number;
  windowSeconds: number;
}): Promise<void> {
  const key = options.key.slice(0, 191);
  const windowMs = Math.max(1, options.windowSeconds) * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const row = await prisma.rateLimitBucket.upsert({
    where: {
      bucketKey_windowStart: { bucketKey: key, windowStart },
    },
    create: {
      bucketKey: key,
      windowStart,
      count: 1,
    },
    update: {
      count: { increment: 1 },
    },
    select: { count: true },
  });

  if (row.count > options.limit) {
    throw new RateLimitError();
  }
}

/** Limpieza oportunista de ventanas viejas (no bloquea el request). */
export function sweepOldRateLimitBuckets(maxAgeHours = 48): void {
  const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  void prisma.rateLimitBucket
    .deleteMany({ where: { windowStart: { lt: cutoff } } })
    .catch(() => {});
}
