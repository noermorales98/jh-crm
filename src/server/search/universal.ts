import { prisma } from "@/src/lib/db";
import { formatMoney } from "@/src/lib/format";
import { fullName } from "@/src/lib/ai/serialize";
import {
  CLIENT_STATUS_LABELS,
  CASE_STATE_LABELS,
  MAIL_FOLDER_LABELS,
  PAYMENT_STATUS_LABELS,
  QUOTE_STATUS_LABELS,
  RECEIPT_STATUS_LABELS,
  ROUND_STATUS_LABELS,
  TASK_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";
import {
  matchCatalog,
  mergeSpotlightHits,
  scoreText,
  type SpotlightHit,
} from "@/src/lib/search/spotlight";
import { searchCrm } from "@/src/server/ai/queries";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";

const TAKE = 6;

function contains(q: string) {
  return { contains: q };
}

function looksLike(q: string, ...aliases: string[]) {
  return scoreText(q, ...aliases) >= 40;
}

async function browseCategoryHits(
  ctx: OrganizationContext,
  q: string,
): Promise<SpotlightHit[]> {
  const orgId = ctx.organizationId;
  const hits: SpotlightHit[] = [];
  const score = 48;

  const jobs: Promise<void>[] = [];

  if (can(ctx.role, "clients.view") && looksLike(q, "cliente", "clientes", "prospecto", "prospectos", "lead")) {
    jobs.push(
      prisma.client
        .findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            clientCode: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
          },
          take: 5,
          orderBy: { updatedAt: "desc" },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: `client-${row.id}`,
              kind: "client",
              title: fullName(row),
              subtitle: [row.clientCode, labelFor(CLIENT_STATUS_LABELS, row.status), row.email]
                .filter(Boolean)
                .join(" · "),
              href: `/crm/clientes/${row.id}`,
              score,
            });
          }
        }),
    );
  }

  if (can(ctx.role, "cases.view") && looksLike(q, "caso", "casos", "pipeline")) {
    jobs.push(
      prisma.creditCase
        .findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            caseCode: true,
            state: true,
            stage: { select: { name: true } },
            client: { select: { firstName: true, lastName: true } },
          },
          take: 5,
          orderBy: { openedAt: "desc" },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: `case-${row.id}`,
              kind: "case",
              title: row.caseCode,
              subtitle: [fullName(row.client), row.stage.name, labelFor(CASE_STATE_LABELS, row.state)].join(" · "),
              href: `/crm/casos/${row.id}`,
              score,
            });
          }
        }),
    );
  }

  if (can(ctx.role, "rounds.view") && looksLike(q, "ronda", "rondas", "disputa")) {
    jobs.push(
      prisma.creditRound
        .findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            roundNumber: true,
            status: true,
            case: {
              select: {
                id: true,
                caseCode: true,
                client: { select: { firstName: true, lastName: true } },
              },
            },
          },
          take: 5,
          orderBy: { expectedReviewAt: "asc" },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: `round-${row.id}`,
              kind: "round",
              title: `Ronda ${row.roundNumber}`,
              subtitle: [row.case.caseCode, fullName(row.case.client), labelFor(ROUND_STATUS_LABELS, row.status)].join(" · "),
              href: `/crm/casos/${row.case.id}/rondas`,
              score,
            });
          }
        }),
    );
  }

  if (can(ctx.role, "quotes.view") && looksLike(q, "cotizacion", "cotizaciones", "cuota", "cuotas", "presupuesto")) {
    jobs.push(
      prisma.quote
        .findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            folio: true,
            status: true,
            total: true,
            currency: true,
            client: { select: { firstName: true, lastName: true } },
          },
          take: 5,
          orderBy: { issuedAt: "desc" },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: `quote-${row.id}`,
              kind: "quote",
              title: row.folio,
              subtitle: [fullName(row.client), formatMoney(row.total, row.currency), labelFor(QUOTE_STATUS_LABELS, row.status)].join(" · "),
              href: `/crm/cotizaciones/${row.id}`,
              score,
            });
          }
        }),
    );
  }

  if (can(ctx.role, "payments.view") && looksLike(q, "pago", "pagos", "cobro", "cobros")) {
    jobs.push(
      prisma.payment
        .findMany({
          where: { organizationId: orgId },
          select: {
            id: true,
            amount: true,
            currency: true,
            status: true,
            client: { select: { firstName: true, lastName: true } },
          },
          take: 5,
          orderBy: { createdAt: "desc" },
        })
        .then((rows) => {
          for (const row of rows) {
            hits.push({
              id: `payment-${row.id}`,
              kind: "payment",
              title: formatMoney(row.amount, row.currency),
              subtitle: [fullName(row.client), labelFor(PAYMENT_STATUS_LABELS, row.status)].join(" · "),
              href: "/crm/pagos",
              score,
            });
          }
        }),
    );
  }

  await Promise.all(jobs);
  return hits;
}

type SearchCrmOk = {
  clients?: Array<{
    id: string;
    name: string;
    clientCode: string;
    statusLabel: string;
    email: string | null;
    href: string;
  }>;
  cases?: Array<{
    id: string;
    caseCode: string;
    statusLabel: string;
    stage: string;
    client: string;
    href: string;
  }>;
  quotes?: Array<{
    id: string;
    folio: string;
    statusLabel: string;
    total: string;
    client: string;
    href: string;
  }>;
  payments?: Array<{
    id: string;
    amount: string;
    statusLabel: string;
    client: string;
    href: string;
  }>;
  tasks?: Array<{
    id: string;
    title: string;
    statusLabel: string;
    client: string | null;
    href: string;
  }>;
  rounds?: Array<{
    id: string;
    roundNumber: number;
    statusLabel: string;
    caseCode: string;
    client: string;
    href: string;
  }>;
  receipts?: Array<{
    id: string;
    folio: string;
    statusLabel: string;
    amount: string;
    client: string;
    href: string;
  }>;
};

export async function universalSearch(
  ctx: OrganizationContext,
  rawQuery: string,
): Promise<SpotlightHit[]> {
  const q = rawQuery.trim();
  const pages = matchCatalog(q, ctx.role);
  if (q.length < 2) {
    return mergeSpotlightHits([pages], q);
  }

  const orgId = ctx.organizationId;
  const [crmRaw, services, packages, mails, users, browse] = await Promise.all([
    searchCrm(ctx, q),
    can(ctx.role, "catalog.view")
      ? prisma.service.findMany({
          where: {
            organizationId: orgId,
            OR: [{ name: contains(q) }, { description: contains(q) }],
          },
          select: {
            id: true,
            name: true,
            description: true,
            defaultPrice: true,
            currency: true,
            isActive: true,
          },
          take: TAKE,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    can(ctx.role, "catalog.view")
      ? prisma.servicePackage.findMany({
          where: {
            organizationId: orgId,
            OR: [{ name: contains(q) }, { description: contains(q) }],
          },
          select: {
            id: true,
            name: true,
            description: true,
            defaultPrice: true,
            currency: true,
            isActive: true,
          },
          take: TAKE,
          orderBy: { updatedAt: "desc" },
        })
      : Promise.resolve([]),
    can(ctx.role, "mails.view")
      ? prisma.mailMessage.findMany({
          where: {
            organizationId: orgId,
            OR: [
              { subject: contains(q) },
              { fromName: contains(q) },
              { fromAddress: contains(q) },
              { translationEsSubject: contains(q) },
            ],
          },
          select: {
            id: true,
            subject: true,
            fromName: true,
            fromAddress: true,
            folder: true,
          },
          take: TAKE,
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    can(ctx.role, "users.manage")
      ? prisma.organizationMember.findMany({
          where: {
            organizationId: orgId,
            user: {
              OR: [{ name: contains(q) }, { email: contains(q) }],
            },
          },
          select: {
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
          take: TAKE,
        })
      : Promise.resolve([]),
    browseCategoryHits(ctx, q),
  ]);

  const crm = crmRaw as SearchCrmOk & { error?: string };
  const recordHits: SpotlightHit[] = [];

  if (!crm.error) {
    for (const row of crm.clients ?? []) {
      recordHits.push({
        id: `client-${row.id}`,
        kind: "client",
        title: row.name,
        subtitle: [row.clientCode, row.statusLabel, row.email].filter(Boolean).join(" · "),
        href: row.href,
        score: scoreText(q, row.name, row.clientCode, row.email ?? ""),
      });
    }
    for (const row of crm.cases ?? []) {
      recordHits.push({
        id: `case-${row.id}`,
        kind: "case",
        title: row.caseCode,
        subtitle: [row.client, row.stage, row.statusLabel].filter(Boolean).join(" · "),
        href: row.href,
        score: scoreText(q, row.caseCode, row.client, row.stage),
      });
    }
    for (const row of crm.rounds ?? []) {
      recordHits.push({
        id: `round-${row.id}`,
        kind: "round",
        title: `Ronda ${row.roundNumber}`,
        subtitle: [row.caseCode, row.client, row.statusLabel].filter(Boolean).join(" · "),
        href: row.href,
        score: scoreText(q, String(row.roundNumber), row.caseCode, row.client),
      });
    }
    for (const row of crm.tasks ?? []) {
      recordHits.push({
        id: `task-${row.id}`,
        kind: "task",
        title: row.title,
        subtitle: [row.client, row.statusLabel].filter(Boolean).join(" · "),
        href: row.href,
        score: scoreText(q, row.title, row.client ?? ""),
      });
    }
    for (const row of crm.quotes ?? []) {
      recordHits.push({
        id: `quote-${row.id}`,
        kind: "quote",
        title: row.folio,
        subtitle: [row.client, row.total, row.statusLabel].filter(Boolean).join(" · "),
        href: row.href,
        score: scoreText(q, row.folio, row.client),
      });
    }
    for (const row of crm.payments ?? []) {
      recordHits.push({
        id: `payment-${row.id}`,
        kind: "payment",
        title: row.amount,
        subtitle: [row.client, row.statusLabel].filter(Boolean).join(" · "),
        href: row.href,
        score: scoreText(q, row.client, row.amount, row.statusLabel),
      });
    }
    for (const row of crm.receipts ?? []) {
      recordHits.push({
        id: `receipt-${row.id}`,
        kind: "receipt",
        title: row.folio,
        subtitle: [row.client, row.amount, row.statusLabel].filter(Boolean).join(" · "),
        href: row.href,
        score: scoreText(q, row.folio, row.client),
      });
    }
  }

  for (const row of services) {
    recordHits.push({
      id: `service-${row.id}`,
      kind: "service",
      title: row.name,
      subtitle: [
        formatMoney(row.defaultPrice, row.currency),
        row.isActive ? "Activo" : "Inactivo",
        row.description ?? "",
      ]
        .filter(Boolean)
        .join(" · "),
      href: "/crm/servicios",
      score: scoreText(q, row.name, row.description ?? ""),
    });
  }
  for (const row of packages) {
    recordHits.push({
      id: `package-${row.id}`,
      kind: "package",
      title: row.name,
      subtitle: [
        formatMoney(row.defaultPrice, row.currency),
        row.isActive ? "Activo" : "Inactivo",
      ].join(" · "),
      href: "/crm/servicios/paquetes",
      score: scoreText(q, row.name, row.description ?? ""),
    });
  }
  for (const row of mails) {
    recordHits.push({
      id: `mail-${row.id}`,
      kind: "mail",
      title: row.subject || "(Sin asunto)",
      subtitle: [
        row.fromName || row.fromAddress,
        labelFor(MAIL_FOLDER_LABELS, row.folder),
      ]
        .filter(Boolean)
        .join(" · "),
      href: `/crm/mails/${row.id}`,
      score: scoreText(q, row.subject, row.fromName ?? "", row.fromAddress),
    });
  }
  for (const row of users) {
    const name = fullName(row.user) || row.user.email;
    recordHits.push({
      id: `user-${row.user.id}`,
      kind: "user",
      title: name,
      subtitle: [row.user.email, row.role].filter(Boolean).join(" · "),
      href: "/crm/usuarios",
      score: scoreText(q, name, row.user.email),
    });
  }

  return mergeSpotlightHits([pages, recordHits, browse], q);
}
