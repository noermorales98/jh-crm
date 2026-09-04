import { Prisma } from "@prisma/client";
import type {
  CreditBureau,
  CreditItemLifecycleStatus,
  CreditNegativeType,
  CreditReportType,
} from "@prisma/client";
import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";

/**
 * Reportes de crédito estructurados: scores por buró + elementos de cuenta.
 * El PDF fuente sigue en Document; aquí solo metadata operativa.
 */

const BUREAUS: CreditBureau[] = ["EXPERIAN", "EQUIFAX", "TRANSUNION"];

const dec = (v: Prisma.Decimal | number | string | null | undefined) => {
  if (v === null || v === undefined || v === "") return null;
  return new Prisma.Decimal(v);
};

export interface BureauSnapshotInput {
  bureau: CreditBureau;
  score?: number | null;
  totalAccounts?: number | null;
  openAccounts?: number | null;
  closedAccounts?: number | null;
  negativeAccounts?: number | null;
  collections?: number | null;
  inquiries?: number | null;
  totalBalance?: Prisma.Decimal | number | string | null;
  utilization?: Prisma.Decimal | number | string | null;
}

export interface CreditItemInput {
  creditorName: string;
  accountNumberMasked?: string | null;
  accountType?: string | null;
  bureau: CreditBureau;
  balance?: Prisma.Decimal | number | string | null;
  creditLimit?: Prisma.Decimal | number | string | null;
  monthlyPayment?: Prisma.Decimal | number | string | null;
  dateOpened?: Date | null;
  dateReported?: Date | null;
  accountStatus?: string | null;
  paymentStatus?: string | null;
  negativeType?: CreditNegativeType | null;
  remarks?: string | null;
  isNegative?: boolean;
  disputeEligible?: boolean;
  lifecycleStatus?: CreditItemLifecycleStatus;
}

export interface CreateCreditReportData {
  caseId: string;
  type?: CreditReportType;
  reportDate: Date;
  provider?: string | null;
  externalReportId?: string | null;
  documentId?: string | null;
  notes?: string | null;
  snapshots?: BureauSnapshotInput[];
  items?: CreditItemInput[];
}

export interface UpdateCreditReportData {
  type?: CreditReportType;
  reportDate?: Date;
  provider?: string | null;
  externalReportId?: string | null;
  documentId?: string | null;
  notes?: string | null;
  snapshots?: BureauSnapshotInput[];
}

function emptyToNull(v: string | null | undefined): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

function snapshotCreateData(snapshot: BureauSnapshotInput) {
  return {
    bureau: snapshot.bureau,
    score: snapshot.score ?? null,
    totalAccounts: snapshot.totalAccounts ?? null,
    openAccounts: snapshot.openAccounts ?? null,
    closedAccounts: snapshot.closedAccounts ?? null,
    negativeAccounts: snapshot.negativeAccounts ?? null,
    collections: snapshot.collections ?? null,
    inquiries: snapshot.inquiries ?? null,
    totalBalance: dec(snapshot.totalBalance),
    utilization: dec(snapshot.utilization),
  };
}

function itemCreateData(
  item: CreditItemInput,
  ids: { organizationId: string; clientId: string; caseId: string; reportId: string },
) {
  const isNegative = item.isNegative ?? item.negativeType != null;
  return {
    organizationId: ids.organizationId,
    clientId: ids.clientId,
    caseId: ids.caseId,
    reportId: ids.reportId,
    creditorName: item.creditorName.trim(),
    accountNumberMasked: emptyToNull(item.accountNumberMasked),
    accountType: emptyToNull(item.accountType),
    bureau: item.bureau,
    balance: dec(item.balance),
    creditLimit: dec(item.creditLimit),
    monthlyPayment: dec(item.monthlyPayment),
    dateOpened: item.dateOpened ?? null,
    dateReported: item.dateReported ?? null,
    accountStatus: emptyToNull(item.accountStatus),
    paymentStatus: emptyToNull(item.paymentStatus),
    negativeType: item.negativeType ?? null,
    remarks: emptyToNull(item.remarks),
    isNegative,
    disputeEligible: item.disputeEligible ?? true,
    lifecycleStatus: item.lifecycleStatus ?? "IDENTIFIED",
  };
}

async function getCaseInOrg(ctx: OrganizationContext, caseId: string) {
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { id: true, clientId: true, caseCode: true, state: true },
  });
  if (!creditCase) throw new DomainError("Caso no encontrado.");
  return creditCase;
}

async function getReportOrThrow(ctx: OrganizationContext, reportId: string) {
  const report = await prisma.creditReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId },
  });
  if (!report) throw new DomainError("Reporte de crédito no encontrado.");
  return report;
}

async function assertDocumentInCase(
  ctx: OrganizationContext,
  documentId: string | null | undefined,
  caseId: string,
  clientId: string,
) {
  if (!documentId) return;
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      organizationId: ctx.organizationId,
      clientId,
      caseId,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!doc) {
    throw new DomainError("Documento no encontrado en este caso.");
  }
}

function normalizeSnapshots(snapshots?: BureauSnapshotInput[]) {
  if (!snapshots?.length) return [];
  const seen = new Set<CreditBureau>();
  const out: BureauSnapshotInput[] = [];
  for (const s of snapshots) {
    if (seen.has(s.bureau)) {
      throw new DomainError(`Snapshot duplicado para ${s.bureau}.`);
    }
    seen.add(s.bureau);
    out.push(s);
  }
  return out;
}

export async function createCreditReport(ctx: OrganizationContext, data: CreateCreditReportData) {
  const creditCase = await getCaseInOrg(ctx, data.caseId);
  await assertDocumentInCase(ctx, data.documentId, creditCase.id, creditCase.clientId);
  const snapshots = normalizeSnapshots(data.snapshots);

  return prisma.$transaction(async (tx) => {
    const report = await tx.creditReport.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        documentId: data.documentId ?? null,
        provider: emptyToNull(data.provider),
        externalReportId: emptyToNull(data.externalReportId),
        reportDate: data.reportDate,
        type: data.type ?? "MANUAL",
        notes: emptyToNull(data.notes),
        snapshots:
          snapshots.length > 0
            ? { create: snapshots.map(snapshotCreateData) }
            : undefined,
      },
      include: { snapshots: true },
    });

    if (data.items?.length) {
      await tx.creditItem.createMany({
        data: data.items.map((item) =>
          itemCreateData(item, {
            organizationId: ctx.organizationId,
            clientId: creditCase.clientId,
            caseId: creditCase.id,
            reportId: report.id,
          }),
        ),
      });
    }

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "CREDIT_REPORT_CREATED",
        description: `Reporte de crédito (${data.type ?? "MANUAL"}) registrado`,
        clientId: creditCase.clientId,
        caseId: creditCase.id,
        metadata: {
          reportId: report.id,
          type: report.type,
          reportDate: report.reportDate.toISOString().slice(0, 10),
          bureaus: snapshots.map((s) => s.bureau),
          itemCount: data.items?.length ?? 0,
        },
      },
      tx,
    );

    return report;
  });
}

export async function updateCreditReport(
  ctx: OrganizationContext,
  reportId: string,
  data: UpdateCreditReportData,
) {
  const existing = await getReportOrThrow(ctx, reportId);
  await assertDocumentInCase(ctx, data.documentId, existing.caseId, existing.clientId);
  const snapshots = data.snapshots !== undefined ? normalizeSnapshots(data.snapshots) : undefined;

  return prisma.$transaction(async (tx) => {
    const report = await tx.creditReport.update({
      where: { id: existing.id },
      data: {
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.reportDate !== undefined ? { reportDate: data.reportDate } : {}),
        ...(data.provider !== undefined ? { provider: emptyToNull(data.provider) } : {}),
        ...(data.externalReportId !== undefined
          ? { externalReportId: emptyToNull(data.externalReportId) }
          : {}),
        ...(data.documentId !== undefined ? { documentId: data.documentId } : {}),
        ...(data.notes !== undefined ? { notes: emptyToNull(data.notes) } : {}),
      },
    });

    if (snapshots !== undefined) {
      await tx.creditBureauSnapshot.deleteMany({ where: { reportId: existing.id } });
      if (snapshots.length > 0) {
        await tx.creditBureauSnapshot.createMany({
          data: snapshots.map((s) => ({
            reportId: existing.id,
            ...snapshotCreateData(s),
          })),
        });
      }
    }

    await writeActivityLog(
      toActivityContext(ctx),
      {
        type: "CREDIT_REPORT_UPDATED",
        description: "Reporte de crédito actualizado",
        clientId: existing.clientId,
        caseId: existing.caseId,
        metadata: { reportId: existing.id },
      },
      tx,
    );

    return report;
  });
}

export async function addCreditItem(ctx: OrganizationContext, reportId: string, data: CreditItemInput) {
  const report = await getReportOrThrow(ctx, reportId);
  const item = await prisma.creditItem.create({
    data: itemCreateData(data, {
      organizationId: ctx.organizationId,
      clientId: report.clientId,
      caseId: report.caseId,
      reportId: report.id,
    }),
  });
  await writeActivityLog(toActivityContext(ctx), {
    type: "CREDIT_REPORT_UPDATED",
    description: `Elemento de crédito añadido: ${item.creditorName}`,
    clientId: report.clientId,
    caseId: report.caseId,
    metadata: { reportId: report.id, itemId: item.id },
  });
  return item;
}

export async function updateCreditItem(
  ctx: OrganizationContext,
  itemId: string,
  data: Partial<CreditItemInput>,
) {
  const item = await prisma.creditItem.findFirst({
    where: { id: itemId, organizationId: ctx.organizationId },
  });
  if (!item) throw new DomainError("Elemento de crédito no encontrado.");

  const isNegative =
    data.isNegative !== undefined
      ? data.isNegative
      : data.negativeType !== undefined
        ? data.negativeType != null
        : undefined;

  const updated = await prisma.creditItem.update({
    where: { id: item.id },
    data: {
      ...(data.creditorName !== undefined ? { creditorName: data.creditorName.trim() } : {}),
      ...(data.accountNumberMasked !== undefined
        ? { accountNumberMasked: emptyToNull(data.accountNumberMasked) }
        : {}),
      ...(data.accountType !== undefined ? { accountType: emptyToNull(data.accountType) } : {}),
      ...(data.bureau !== undefined ? { bureau: data.bureau } : {}),
      ...(data.balance !== undefined ? { balance: dec(data.balance) } : {}),
      ...(data.creditLimit !== undefined ? { creditLimit: dec(data.creditLimit) } : {}),
      ...(data.monthlyPayment !== undefined ? { monthlyPayment: dec(data.monthlyPayment) } : {}),
      ...(data.dateOpened !== undefined ? { dateOpened: data.dateOpened } : {}),
      ...(data.dateReported !== undefined ? { dateReported: data.dateReported } : {}),
      ...(data.accountStatus !== undefined
        ? { accountStatus: emptyToNull(data.accountStatus) }
        : {}),
      ...(data.paymentStatus !== undefined
        ? { paymentStatus: emptyToNull(data.paymentStatus) }
        : {}),
      ...(data.negativeType !== undefined ? { negativeType: data.negativeType } : {}),
      ...(data.remarks !== undefined ? { remarks: emptyToNull(data.remarks) } : {}),
      ...(isNegative !== undefined ? { isNegative } : {}),
      ...(data.disputeEligible !== undefined ? { disputeEligible: data.disputeEligible } : {}),
      ...(data.lifecycleStatus !== undefined ? { lifecycleStatus: data.lifecycleStatus } : {}),
    },
  });

  await writeActivityLog(toActivityContext(ctx), {
    type: "CREDIT_REPORT_UPDATED",
    description: `Elemento de crédito actualizado: ${updated.creditorName}`,
    clientId: item.clientId,
    caseId: item.caseId,
    metadata: { reportId: item.reportId, itemId: item.id },
  });

  return updated;
}

export async function deleteCreditItem(ctx: OrganizationContext, itemId: string) {
  const item = await prisma.creditItem.findFirst({
    where: { id: itemId, organizationId: ctx.organizationId },
  });
  if (!item) throw new DomainError("Elemento de crédito no encontrado.");

  await prisma.creditItem.delete({ where: { id: item.id } });
  await writeActivityLog(toActivityContext(ctx), {
    type: "CREDIT_REPORT_UPDATED",
    description: `Elemento de crédito eliminado: ${item.creditorName}`,
    clientId: item.clientId,
    caseId: item.caseId,
    metadata: { reportId: item.reportId, itemId: item.id },
  });
  return { id: item.id, caseId: item.caseId, reportId: item.reportId };
}

export async function listReportsForCase(ctx: OrganizationContext, caseId: string) {
  await getCaseInOrg(ctx, caseId);
  return prisma.creditReport.findMany({
    where: { organizationId: ctx.organizationId, caseId },
    orderBy: [{ reportDate: "asc" }, { importedAt: "asc" }],
    include: {
      snapshots: { orderBy: { bureau: "asc" } },
      _count: { select: { items: true } },
      document: { select: { id: true, displayName: true, originalName: true, category: true } },
    },
  });
}

export async function getReportDetail(ctx: OrganizationContext, reportId: string) {
  const report = await prisma.creditReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId },
    include: {
      snapshots: { orderBy: { bureau: "asc" } },
      items: { orderBy: [{ isNegative: "desc" }, { creditorName: "asc" }] },
      document: {
        select: {
          id: true,
          displayName: true,
          originalName: true,
          category: true,
          mimeType: true,
        },
      },
      case: {
        select: {
          id: true,
          caseCode: true,
          state: true,
          client: {
            select: { id: true, clientCode: true, firstName: true, lastName: true },
          },
        },
      },
    },
  });
  if (!report) throw new DomainError("Reporte de crédito no encontrado.");
  return report;
}

export type ScoreRow = {
  reportId: string;
  reportDate: Date;
  type: CreditReportType;
  label: string;
  scores: Record<CreditBureau, number | null>;
};

export type BureauScoreCurrent = {
  bureau: CreditBureau;
  score: number | null;
  previousScore: number | null;
  delta: number | null;
  reportId: string | null;
  reportDate: Date | null;
};

export type CaseCreditOverview = {
  caseId: string;
  current: BureauScoreCurrent[];
  history: ScoreRow[];
  reports: Awaited<ReturnType<typeof listReportsForCase>>;
  negativeItemCount: number;
};

function typeLabel(type: CreditReportType, index: number): string {
  if (type === "INITIAL") return "Inicio";
  if (type === "UPDATE") return `Actualización ${index}`;
  return `Manual ${index}`;
}

export async function getCaseCreditOverview(
  ctx: OrganizationContext,
  caseId: string,
): Promise<CaseCreditOverview> {
  const reports = await listReportsForCase(ctx, caseId);

  let updateIndex = 0;
  let manualIndex = 0;
  const history: ScoreRow[] = reports.map((report) => {
    let label: string;
    if (report.type === "INITIAL") {
      label = "Inicio";
    } else if (report.type === "UPDATE") {
      updateIndex += 1;
      label = `Actualización ${updateIndex}`;
    } else {
      manualIndex += 1;
      label = typeLabel(report.type, manualIndex);
    }
    const scores = Object.fromEntries(BUREAUS.map((b) => [b, null])) as Record<
      CreditBureau,
      number | null
    >;
    for (const snap of report.snapshots) {
      scores[snap.bureau] = snap.score;
    }
    return {
      reportId: report.id,
      reportDate: report.reportDate,
      type: report.type,
      label,
      scores,
    };
  });

  const current: BureauScoreCurrent[] = BUREAUS.map((bureau) => {
    const withScore = [...history].reverse().find((row) => row.scores[bureau] != null);
    const previous = withScore
      ? [...history]
          .reverse()
          .filter((row) => row.reportId !== withScore.reportId)
          .find((row) => row.scores[bureau] != null)
      : undefined;
    const score = withScore?.scores[bureau] ?? null;
    const previousScore = previous?.scores[bureau] ?? null;
    return {
      bureau,
      score,
      previousScore,
      delta: score != null && previousScore != null ? score - previousScore : null,
      reportId: withScore?.reportId ?? null,
      reportDate: withScore?.reportDate ?? null,
    };
  });

  const negativeItemCount = await prisma.creditItem.count({
    where: { organizationId: ctx.organizationId, caseId, isNegative: true },
  });

  return { caseId, current, history, reports, negativeItemCount };
}

/** Verifica aislamiento de tenant: reporte de otra org no es visible. */
export async function assertReportTenantIsolation(
  ctx: OrganizationContext,
  reportId: string,
): Promise<boolean> {
  const report = await prisma.creditReport.findFirst({
    where: { id: reportId, organizationId: ctx.organizationId },
    select: { id: true },
  });
  return report != null;
}
