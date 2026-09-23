/**
 * Smoke con DB: listAttentionTasks prioriza vencidas LOW sobre URGENT futuras.
 *
 * Escenario: 40 URGENT la semana que viene + 1 LOW vencida ayer + 1 NORMAL hoy.
 * Expectativa take=12: vencida 1ª («Urgente»), hoy 2ª, total 12.
 * Limpia al final todo lo creado (títulos E2E-ATTN-).
 *
 * Uso: npm run smoke:ts-attention
 */
import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_TIMEZONE,
  zonedDateAtHour,
  zonedDayRange,
} from "../../src/lib/format/dates";
import { listAttentionTasks } from "../../src/server/tasks";
import type { OrganizationContext } from "../../src/server/auth/guards";

const prisma = new PrismaClient();
const PREFIX = "E2E-ATTN-";

function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
    throw new Error(`FAIL: ${label}`);
  }
}

async function cleanup(organizationId: string) {
  const del = await prisma.task.deleteMany({
    where: {
      organizationId,
      title: { startsWith: PREFIX },
    },
  });
  console.log(`cleanup: ${del.count} tareas`);
}

async function main() {
  const org = await prisma.organization.findFirstOrThrow({
    where: { name: "J&H Multiservices LLC" },
  });
  const owner = await prisma.organizationMember.findFirstOrThrow({
    where: { organizationId: org.id, role: "OWNER" },
  });
  const settings = await prisma.organizationSettings.findUnique({
    where: { organizationId: org.id },
    select: { timezone: true },
  });
  const tz = settings?.timezone ?? DEFAULT_TIMEZONE;
  const now = new Date();
  const today = zonedDayRange(now, tz);
  const todayYmd = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // Ayer = start of today − 12h stays in previous calendar day in zone.
  const yesterdayDue = new Date(today.start.getTime() - 12 * 60 * 60 * 1000);
  const todayDue = zonedDateAtHour(todayYmd, tz, 12);

  const [y, m, d] = todayYmd.split("-").map(Number);
  const nextWeekUtc = new Date(Date.UTC(y, m - 1, d + 7));
  const nextWeekYmd = nextWeekUtc.toISOString().slice(0, 10);
  const nextWeekDue = zonedDateAtHour(nextWeekYmd, tz, 12);

  await cleanup(org.id);

  const createdIds: string[] = [];
  try {
    const overdue = await prisma.task.create({
      data: {
        organizationId: org.id,
        title: `${PREFIX}vencida-low`,
        type: "OTHER",
        priority: "LOW",
        dueAt: yesterdayDue,
        assignedToId: owner.userId,
        createdById: owner.userId,
      },
    });
    createdIds.push(overdue.id);

    const todayTask = await prisma.task.create({
      data: {
        organizationId: org.id,
        title: `${PREFIX}hoy-normal`,
        type: "OTHER",
        priority: "NORMAL",
        dueAt: todayDue,
        assignedToId: owner.userId,
        createdById: owner.userId,
      },
    });
    createdIds.push(todayTask.id);

    for (let i = 0; i < 40; i++) {
      const t = await prisma.task.create({
        data: {
          organizationId: org.id,
          title: `${PREFIX}urgent-semana-${i}`,
          type: "OTHER",
          priority: "URGENT",
          dueAt: nextWeekDue,
          assignedToId: owner.userId,
          createdById: owner.userId,
        },
      });
      createdIds.push(t.id);
    }

    const ctx: OrganizationContext = {
      userId: owner.userId,
      organizationId: org.id,
      role: "OWNER",
    };

    const rows = await listAttentionTasks(ctx, { take: 12, timezone: tz });

    check("total 12", rows.length === 12, `got ${rows.length}`);
    check(
      "1ª es vencida con Urgente",
      rows[0]?.id === overdue.id && rows[0]?.badge === "Urgente",
      `got id=${rows[0]?.id} badge=${rows[0]?.badge}`,
    );
    check(
      "2ª es hoy",
      rows[1]?.id === todayTask.id,
      `got id=${rows[1]?.id} badge=${rows[1]?.badge}`,
    );
    check(
      "dueBucket overdue en 1ª",
      rows[0]?.dueBucket === "overdue",
      `got ${rows[0]?.dueBucket}`,
    );

    console.log("\nOK");
  } finally {
    await cleanup(org.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
