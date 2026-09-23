/**
 * Corrige dueAt/reminderAt guardados a medianoche UTC exacta (YYYY-MM-DD
 * vía z.coerce.date) en tareas creadas a mano (externalKey IS NULL) —
 * incluye las tareas de revisión de ronda (CREDIT_UPDATE / REVIEW_RESULT),
 * que no llevan externalKey — y CreditRound.expectedReviewAt.
 *
 * ServiceCase.nextActionAt (copiado de la ronda) lo corrige
 * fix-entity-utc-midnight-dates.ts.
 *
 * Por defecto solo simula. Escribe con --apply (lotes de 50).
 *
 * Uso:
 *   npm run fix:task-dates
 *   npm run fix:task-dates -- --apply
 *
 * Nota: updatedAt cambiará en las filas tocadas.
 */
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_TIMEZONE,
  formatDate,
  zonedDateAtHour,
} from "../src/lib/format/dates";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const BATCH = 50;

function isUtcMidnight(d: Date): boolean {
  return (
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  );
}

async function main() {
  const settings = await prisma.organizationSettings.findMany({
    select: { organizationId: true, timezone: true },
  });
  const tzByOrg = new Map(
    settings.map((s) => [s.organizationId, s.timezone || DEFAULT_TIMEZONE]),
  );
  const tzOf = (orgId: string) => tzByOrg.get(orgId) ?? DEFAULT_TIMEZONE;

  // Candidatas: externalKey null y al menos una fecha a 00:00 UTC.
  // Filtramos medianoche exacta en memoria (Prisma no expresa ms UTC fácil).
  const candidates = await prisma.task.findMany({
    where: {
      externalKey: null,
      OR: [{ dueAt: { not: null } }, { reminderAt: { not: null } }],
    },
    select: {
      id: true,
      organizationId: true,
      title: true,
      dueAt: true,
      reminderAt: true,
    },
    orderBy: { id: "asc" },
  });

  type Fix = {
    id: string;
    organizationId: string;
    title: string;
    dueAt?: { old: Date; next: Date };
    reminderAt?: { old: Date; next: Date };
  };

  const fixes: Fix[] = [];
  for (const task of candidates) {
    const tz = tzOf(task.organizationId);
    const fix: Fix = {
      id: task.id,
      organizationId: task.organizationId,
      title: task.title,
    };
    if (task.dueAt && isUtcMidnight(task.dueAt)) {
      const ymd = task.dueAt.toISOString().slice(0, 10);
      fix.dueAt = { old: task.dueAt, next: zonedDateAtHour(ymd, tz, 12) };
    }
    if (task.reminderAt && isUtcMidnight(task.reminderAt)) {
      const ymd = task.reminderAt.toISOString().slice(0, 10);
      fix.reminderAt = {
        old: task.reminderAt,
        next: zonedDateAtHour(ymd, tz, 9),
      };
    }
    if (fix.dueAt || fix.reminderAt) fixes.push(fix);
  }

  // CreditRound.expectedReviewAt: fecha de solo día desde markRoundSent.
  const rounds = await prisma.creditRound.findMany({
    where: { expectedReviewAt: { not: null } },
    select: {
      id: true,
      organizationId: true,
      roundNumber: true,
      expectedReviewAt: true,
    },
    orderBy: { id: "asc" },
  });

  type RoundFix = {
    id: string;
    organizationId: string;
    roundNumber: number;
    old: Date;
    next: Date;
  };

  const roundFixes: RoundFix[] = [];
  for (const round of rounds) {
    if (!round.expectedReviewAt || !isUtcMidnight(round.expectedReviewAt)) {
      continue;
    }
    const ymd = round.expectedReviewAt.toISOString().slice(0, 10);
    roundFixes.push({
      id: round.id,
      organizationId: round.organizationId,
      roundNumber: round.roundNumber,
      old: round.expectedReviewAt,
      next: zonedDateAtHour(ymd, tzOf(round.organizationId), 12),
    });
  }

  const byOrg = new Map<string, number>();
  for (const f of fixes) {
    byOrg.set(f.organizationId, (byOrg.get(f.organizationId) ?? 0) + 1);
  }

  console.log(
    APPLY
      ? `APPLY: corrigiendo ${fixes.length} tarea(s) y ${roundFixes.length} ronda(s)`
      : `DRY-RUN: ${fixes.length} tarea(s) y ${roundFixes.length} ronda(s) a corregir (pasa --apply para escribir)`,
  );
  console.log("Por organización:");
  for (const [orgId, n] of byOrg) {
    console.log(`  ${orgId}: ${n}`);
  }

  const examples = fixes.slice(0, 20);
  if (examples.length) {
    console.log("\nEjemplos (hasta 20):");
    for (const f of examples) {
      const tz = tzOf(f.organizationId);
      const parts: string[] = [`id=${f.id}`, `title=${JSON.stringify(f.title)}`];
      if (f.dueAt) {
        parts.push(
          `dueAt ${f.dueAt.old.toISOString()} → ${f.dueAt.next.toISOString()} (local ${formatDate(f.dueAt.next, tz)})`,
        );
      }
      if (f.reminderAt) {
        parts.push(
          `reminderAt ${f.reminderAt.old.toISOString()} → ${f.reminderAt.next.toISOString()} (local ${formatDate(f.reminderAt.next, tz)})`,
        );
      }
      console.log(`  - ${parts.join(" | ")}`);
    }
  }

  if (roundFixes.length) {
    console.log("\nRondas (hasta 20):");
    for (const r of roundFixes.slice(0, 20)) {
      console.log(
        `  - round id=${r.id} #${r.roundNumber} | expectedReviewAt ${r.old.toISOString()} → ${r.next.toISOString()} (local ${formatDate(r.next, tzOf(r.organizationId))})`,
      );
    }
  }

  if (!APPLY || fixes.length + roundFixes.length === 0) {
    if (!APPLY) {
      console.log(
        "\nAviso: con --apply, updatedAt de estas tareas y rondas cambiará.",
      );
    }
    return;
  }

  let updated = 0;
  for (let i = 0; i < fixes.length; i += BATCH) {
    const batch = fixes.slice(i, i + BATCH);
    for (const f of batch) {
      await prisma.task.update({
        where: { id: f.id },
        data: {
          ...(f.dueAt ? { dueAt: f.dueAt.next } : {}),
          ...(f.reminderAt ? { reminderAt: f.reminderAt.next } : {}),
        },
      });
      updated += 1;
    }
    console.log(`  lote ${i / BATCH + 1}: ${updated}/${fixes.length}`);
  }
  console.log(`Hecho: ${updated} actualizadas.`);

  let roundsUpdated = 0;
  for (let i = 0; i < roundFixes.length; i += BATCH) {
    const batch = roundFixes.slice(i, i + BATCH);
    for (const r of batch) {
      await prisma.creditRound.update({
        where: { id: r.id },
        data: { expectedReviewAt: r.next },
      });
      roundsUpdated += 1;
    }
    console.log(`  rondas lote ${i / BATCH + 1}: ${roundsUpdated}/${roundFixes.length}`);
  }
  console.log(`Hecho: ${roundsUpdated} ronda(s) actualizadas.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
