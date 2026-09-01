/**
 * Limpieza y verificación del fixture del cron.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/smoke/cleanup-cron.ts <taskId>
 *
 * Verifica que dos ejecuciones del cron no duplicaron notificaciones
 * (dedupeKey) y elimina el fixture y sus notificaciones.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const taskId = process.argv[2];
  if (!taskId) throw new Error("Falta <taskId> del fixture.");

  const notifications = await prisma.notification.findMany({
    where: { dedupeKey: { startsWith: `task:${taskId}:` } },
    select: { id: true, dedupeKey: true, type: true },
  });
  const keys = notifications.map((n) => n.dedupeKey);
  console.log("Notificaciones del fixture:", keys);
  const expected = [`task:${taskId}:due`, `task:${taskId}:overdue`];
  const ok =
    notifications.length === 2 &&
    expected.every((k) => keys.includes(k));
  console.log(ok
    ? "✓ Idempotencia del cron verificada (2 notificaciones, sin duplicados tras 2 corridas)"
    : "✗ Se esperaban exactamente 2 notificaciones (due + overdue)");

  await prisma.notification.deleteMany({ where: { dedupeKey: { startsWith: `task:${taskId}:` } } });
  await prisma.task.delete({ where: { id: taskId } });
  console.log("Fixture cron eliminado.");
  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("FALLO en cleanup-cron:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
