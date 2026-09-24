/**
 * Corrige fechas de solo día guardadas a medianoche UTC exacta (YYYY-MM-DD
 * vía optionalDateSchema / z.coerce.date) → mediodía en la TZ de la org:
 *   Payment.dueAt, Payment.receivedAt, Opportunity.nextFollowUpAt,
 *   ServiceCase.nextActionAt, PaymentInstallment.dueAt, PaymentPlan.startDate.
 * Después re-sincroniza las Tasks automáticas (Cobrar / Contactar /
 * Próxima acción) de las filas tocadas para que copien la fecha nueva.
 *
 * Por defecto solo simula. Escribe con --apply (lotes de 50).
 *
 * Uso:
 *   npm run fix:entity-dates
 *   npm run fix:entity-dates -- --apply
 *
 * Nota: updatedAt cambiará en las filas tocadas.
 */
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_TIMEZONE,
  formatDate,
  zonedDateAtHour,
} from "../src/lib/format/dates";
import {
  ensureTaskForOpportunityFollowUp,
  ensureTaskForPayment,
  ensureTaskForServiceNextAction,
} from "../src/server/automations";

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

type Entity =
  | "payment"
  | "opportunity"
  | "serviceCase"
  | "paymentInstallment"
  | "paymentPlan";

type Fix = {
  entity: Entity;
  id: string;
  organizationId: string;
  fields: Record<string, { old: Date; next: Date }>;
};

async function main() {
  const settings = await prisma.organizationSettings.findMany({
    select: { organizationId: true, timezone: true },
  });
  const tzByOrg = new Map(
    settings.map((s) => [s.organizationId, s.timezone || DEFAULT_TIMEZONE]),
  );
  const tzOf = (orgId: string) => tzByOrg.get(orgId) ?? DEFAULT_TIMEZONE;

  const fixes: Fix[] = [];
  function collect(
    entity: Entity,
    row: { id: string; organizationId: string } & Record<string, unknown>,
    fields: string[],
  ) {
    const tz = tzOf(row.organizationId);
    const fix: Fix = {
      entity,
      id: row.id,
      organizationId: row.organizationId,
      fields: {},
    };
    for (const field of fields) {
      const value = row[field];
      if (value instanceof Date && isUtcMidnight(value)) {
        const ymd = value.toISOString().slice(0, 10);
        fix.fields[field] = { old: value, next: zonedDateAtHour(ymd, tz, 12) };
      }
    }
    if (Object.keys(fix.fields).length) fixes.push(fix);
  }

  // Filtramos medianoche exacta en memoria (Prisma no expresa ms UTC fácil).
  const payments = await prisma.payment.findMany({
    where: { OR: [{ dueAt: { not: null } }, { receivedAt: { not: null } }] },
    select: { id: true, organizationId: true, dueAt: true, receivedAt: true },
    orderBy: { id: "asc" },
  });
  for (const p of payments) collect("payment", p, ["dueAt", "receivedAt"]);

  const opportunities = await prisma.opportunity.findMany({
    where: { nextFollowUpAt: { not: null } },
    select: { id: true, organizationId: true, nextFollowUpAt: true },
    orderBy: { id: "asc" },
  });
  for (const o of opportunities) collect("opportunity", o, ["nextFollowUpAt"]);

  const serviceCases = await prisma.serviceCase.findMany({
    where: { nextActionAt: { not: null } },
    select: { id: true, organizationId: true, nextActionAt: true },
    orderBy: { id: "asc" },
  });
  for (const s of serviceCases) collect("serviceCase", s, ["nextActionAt"]);

  // Cuotas: mismo instante que su Payment (addInstallmentDate), así que la
  // corrección de Payment.dueAt y la de aquí coinciden.
  const installments = await prisma.paymentInstallment.findMany({
    select: { id: true, organizationId: true, dueAt: true },
    orderBy: { id: "asc" },
  });
  for (const pi of installments) collect("paymentInstallment", pi, ["dueAt"]);

  const plans = await prisma.paymentPlan.findMany({
    select: { id: true, organizationId: true, startDate: true },
    orderBy: { id: "asc" },
  });
  for (const pl of plans) collect("paymentPlan", pl, ["startDate"]);

  const byEntity = new Map<string, number>();
  for (const f of fixes) {
    for (const field of Object.keys(f.fields)) {
      const key = `${f.entity}.${field}`;
      byEntity.set(key, (byEntity.get(key) ?? 0) + 1);
    }
  }

  console.log(
    APPLY
      ? `APPLY: corrigiendo ${fixes.length} fila(s)`
      : `DRY-RUN: ${fixes.length} fila(s) a corregir (pasa --apply para escribir)`,
  );
  console.log("Por campo:");
  for (const [key, n] of byEntity) console.log(`  ${key}: ${n}`);

  const examples = fixes.slice(0, 20);
  if (examples.length) {
    console.log("\nEjemplos (hasta 20):");
    for (const f of examples) {
      const tz = tzOf(f.organizationId);
      const parts = [`${f.entity} id=${f.id}`];
      for (const [field, { old, next }] of Object.entries(f.fields)) {
        parts.push(
          `${field} ${old.toISOString()} → ${next.toISOString()} (local ${formatDate(next, tz)})`,
        );
      }
      console.log(`  - ${parts.join(" | ")}`);
    }
  }

  if (!APPLY || fixes.length === 0) {
    if (!APPLY) {
      console.log("\nAviso: con --apply, updatedAt de estas filas cambiará.");
    }
    return;
  }

  let updated = 0;
  for (let i = 0; i < fixes.length; i += BATCH) {
    const batch = fixes.slice(i, i + BATCH);
    for (const f of batch) {
      const data = Object.fromEntries(
        Object.entries(f.fields).map(([field, { next }]) => [field, next]),
      );
      if (f.entity === "payment") {
        await prisma.payment.update({ where: { id: f.id }, data });
      } else if (f.entity === "opportunity") {
        await prisma.opportunity.update({ where: { id: f.id }, data });
      } else if (f.entity === "serviceCase") {
        await prisma.serviceCase.update({ where: { id: f.id }, data });
      } else if (f.entity === "paymentInstallment") {
        await prisma.paymentInstallment.update({ where: { id: f.id }, data });
      } else {
        await prisma.paymentPlan.update({ where: { id: f.id }, data });
      }
      updated += 1;
    }
    console.log(`  lote ${i / BATCH + 1}: ${updated}/${fixes.length}`);
  }
  console.log(`Hecho: ${updated} actualizadas.`);

  // Re-sync de Tasks automáticas: mismo criterio que reconcileWorkQueueTasks,
  // pero solo para las filas corregidas.
  const ids = (entity: Entity) =>
    fixes.filter((f) => f.entity === entity).map((f) => f.id);

  const pendingPayments = await prisma.payment.findMany({
    where: { id: { in: ids("payment") }, status: "PENDING" },
    select: { id: true, organizationId: true },
  });
  const openOpportunities = await prisma.opportunity.findMany({
    where: {
      id: { in: ids("opportunity") },
      stage: { notIn: ["WON", "LOST"] },
      nextFollowUpAt: { not: null },
    },
    select: { id: true, organizationId: true },
  });
  const openServiceCases = await prisma.serviceCase.findMany({
    where: {
      id: { in: ids("serviceCase") },
      archivedAt: null,
      status: { in: ["OPEN", "ON_HOLD"] },
      nextActionAt: { not: null },
    },
    select: { id: true, organizationId: true },
  });

  let synced = 0;
  for (const p of pendingPayments) {
    if (await ensureTaskForPayment(p.organizationId, p.id)) synced += 1;
  }
  for (const o of openOpportunities) {
    if (await ensureTaskForOpportunityFollowUp(o.organizationId, o.id)) synced += 1;
  }
  for (const s of openServiceCases) {
    if (await ensureTaskForServiceNextAction(s.organizationId, s.id)) synced += 1;
  }
  console.log(
    `Tasks re-sincronizadas: ${synced} (pagos ${pendingPayments.length}, leads ${openOpportunities.length}, expedientes ${openServiceCases.length}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
