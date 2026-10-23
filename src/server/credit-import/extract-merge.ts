/**
 * Coerción, merge y heurística de scores de propuestas PDF.
 */
import { normalizeCreditObservation } from "@/src/lib/credit/normalize";
import {
  EXTRACTION_ITEM_CEILING,
  creditPdfExtractionProposalSchema,
  type CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";

type Proposal = CreditPdfExtractionProposal;
type Snapshot = NonNullable<
  NonNullable<Proposal["report"]>["snapshots"]
>[number];

const BUREAUS = ["EXPERIAN", "EQUIFAX", "TRANSUNION"] as const;
type Bureau = (typeof BUREAUS)[number];

function emptyManualReviewProposal(
  warnings: string[],
): CreditPdfExtractionProposal {
  return creditPdfExtractionProposalSchema.parse({
    documentKind: "UNKNOWN",
    confidence: "low",
    warnings,
    client: null,
    report: { snapshots: [], items: [] },
    progress: null,
  });
}

function optionalIntField(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  return i >= 0 ? i : null;
}

function sanitizeRawItem(item: unknown): unknown {
  if (!item || typeof item !== "object") return item;
  const next = { ...(item as Record<string, unknown>) };
  const page = optionalIntField(next.sourcePage);
  if (page == null || page < 1) delete next.sourcePage;
  else next.sourcePage = page;
  const windowIndex = optionalIntField(next.sourceWindow);
  if (windowIndex == null) delete next.sourceWindow;
  else next.sourceWindow = windowIndex;
  if (typeof next.responsibility !== "string") delete next.responsibility;
  delete next.fieldQuality;
  return next;
}

function asBureau(raw: unknown): Bureau | null {
  if (typeof raw !== "string") return null;
  const u = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (u === "EXPERIAN") return "EXPERIAN";
  if (u === "EQUIFAX") return "EQUIFAX";
  if (u === "TRANSUNION" || u === "TRANS") return "TRANSUNION";
  return null;
}

function asScore(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  const i = Math.round(n);
  if (i < 300 || i > 900) return null;
  return i;
}

/** Coerce AI JSON so Zod max(3) snapshots / max(200) items no tiran toda la propuesta. */
export function coerceExtractionRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const o = { ...(raw as Record<string, unknown>) };
  const report = o.report;
  if (!report || typeof report !== "object") return o;
  const r = { ...(report as Record<string, unknown>) };

  if (Array.isArray(r.snapshots)) {
    const byBureau = new Map<Bureau, Snapshot>();
    for (const entry of r.snapshots) {
      if (!entry || typeof entry !== "object") continue;
      const s = entry as Record<string, unknown>;
      const bureau = asBureau(s.bureau);
      if (!bureau) continue;
      const score = asScore(s.score);
      const utilRaw =
        s.utilization == null ? null : Number(s.utilization);
      const utilization =
        utilRaw != null &&
        Number.isFinite(utilRaw) &&
        utilRaw >= 0 &&
        utilRaw <= 100
          ? utilRaw
          : null;
      const next: Snapshot = {
        bureau,
        score,
        totalAccounts:
          typeof s.totalAccounts === "number" && s.totalAccounts >= 0
            ? Math.min(9999, Math.round(s.totalAccounts))
            : null,
        openAccounts:
          typeof s.openAccounts === "number" && s.openAccounts >= 0
            ? Math.min(9999, Math.round(s.openAccounts))
            : null,
        closedAccounts:
          typeof s.closedAccounts === "number" && s.closedAccounts >= 0
            ? Math.min(9999, Math.round(s.closedAccounts))
            : null,
        negativeAccounts:
          typeof s.negativeAccounts === "number" && s.negativeAccounts >= 0
            ? Math.min(9999, Math.round(s.negativeAccounts))
            : null,
        collections:
          typeof s.collections === "number" && s.collections >= 0
            ? Math.min(9999, Math.round(s.collections))
            : null,
        inquiries:
          typeof s.inquiries === "number" && s.inquiries >= 0
            ? Math.min(9999, Math.round(s.inquiries))
            : null,
        modelFamily: typeof s.modelFamily === "string" ? s.modelFamily : null,
        modelVersion: typeof s.modelVersion === "string" ? s.modelVersion : null,
        reasonCodes: Array.isArray(s.reasonCodes)
          ? s.reasonCodes.filter((code): code is string => typeof code === "string").slice(0, 8)
          : null,
        totalBalance: null,
        utilization,
      };
      const prev = byBureau.get(bureau);
      if (!prev || (prev.score == null && score != null)) {
        byBureau.set(bureau, next);
      }
    }
    r.snapshots = [...byBureau.values()].slice(0, 3);
  }

  if (Array.isArray(r.items)) {
    r.items = r.items.map((item) => sanitizeRawItem(item));
  }

  if (Array.isArray(r.items) && r.items.length > EXTRACTION_ITEM_CEILING) {
    const omitted = r.items.length - EXTRACTION_ITEM_CEILING;
    r.items = r.items.slice(0, EXTRACTION_ITEM_CEILING);
    const warnings = Array.isArray(o.warnings) ? [...o.warnings] : [];
    warnings.push(`Se omitieron ${omitted} ítems por el techo de extracción.`);
    o.warnings = warnings;
  }

  o.report = r;
  return o;
}


export function extractScoreSnapshotsFromText(text: string): Snapshot[] {
  const byBureau = new Map<Bureau, Snapshot>();
  const patterns: Array<{ bureau: Bureau; re: RegExp }> = [
    { bureau: "EQUIFAX", re: /\bEquifax\s*\d*\s*[^\d]{0,12}?(\d{3})\b/gi },
    { bureau: "EXPERIAN", re: /\bExperian\s*\d*\s*[^\d]{0,12}?(\d{3})\b/gi },
    {
      bureau: "TRANSUNION",
      re: /\bTrans\s*-?\s*Union\s*\d*\s*[^\d]{0,12}?(\d{3})\b/gi,
    },
  ];

  for (const { bureau, re } of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const score = asScore(Number(m[1]));
      if (score == null) continue;
      // Evitar capturar códigos de “120 days” / edades raras: ya filtrado 300–900
      if (!byBureau.has(bureau)) {
        byBureau.set(bureau, { bureau, score });
      }
    }
  }

  return BUREAUS.map((b) => byBureau.get(b)).filter(
    (s): s is Snapshot => s != null,
  );
}

const CONF_RANK: Record<Proposal["confidence"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const KIND_RANK: Record<Proposal["documentKind"], number> = {
  UNKNOWN: 0,
  CLIENT_PROGRESS_REPORT: 1,
  CREDIT_BUREAU_REPORT: 2,
};

function itemKey(it: {
  creditorName: string;
  bureau: string;
  accountNumberMasked?: string | null;
}): string {
  const acct = (it.accountNumberMasked ?? "").replace(/\D/g, "").slice(-4);
  return `${it.bureau}|${it.creditorName.trim().toLowerCase()}|${acct}`;
}

/**
 * Fusiona propuestas parciales de ventanas en una sola.
 * Preferencia: CREDIT_BUREAU_REPORT > progress > UNKNOWN; scores por buró;
 * items dedupe; client = primer valor no vacío.
 */
export function mergeExtractionProposals(
  parts: CreditPdfExtractionProposal[],
): CreditPdfExtractionProposal {
  if (parts.length === 0) {
    return emptyManualReviewProposal([
      "Sin propuestas parciales para fusionar.",
    ]);
  }

  let documentKind: Proposal["documentKind"] = "UNKNOWN";
  let confidence: Proposal["confidence"] = "low";
  const warnings: string[] = [];
  if (parts.length > 1) {
    warnings.push(
      `Extracción en ${parts.length} ventanas de texto (PDF grande); revisa antes de confirmar.`,
    );
  }

  for (const p of parts) {
    if (KIND_RANK[p.documentKind] > KIND_RANK[documentKind]) {
      documentKind = p.documentKind;
    }
    if (CONF_RANK[p.confidence] > CONF_RANK[confidence]) {
      confidence = p.confidence;
    }
    for (const w of p.warnings ?? []) {
      if (warnings.length < 30 && !warnings.includes(w)) warnings.push(w);
    }
  }

  const clientAcc: NonNullable<Proposal["client"]> = {};
  for (const p of parts) {
    const c = p.client;
    if (!c) continue;
    for (const key of [
      "firstName",
      "lastName",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "postalCode",
      "country",
    ] as const) {
      const v = c[key];
      if (v && !(clientAcc as Record<string, unknown>)[key]) {
        (clientAcc as Record<string, string>)[key] = v;
      }
    }
  }
  clientAcc.dateOfBirth = null;
  clientAcc.ssnLast4 = null;

  const snapByBureau = new Map<string, Snapshot>();
  let reportDate: string | null = null;
  let provider: string | null = null;
  let typeHint: NonNullable<Proposal["report"]>["typeHint"] = null;
  let notes: string | null = null;
  const itemsByKey = new Map<
    string,
    NonNullable<NonNullable<Proposal["report"]>["items"]>[number]
  >();

  for (const p of parts) {
    const r = p.report;
    if (!r) continue;
    if (r.reportDate && !reportDate) reportDate = r.reportDate;
    if (r.provider && !provider) provider = r.provider;
    if (r.typeHint && !typeHint) typeHint = r.typeHint;
    if (r.notes && !notes) notes = r.notes;
    for (const s of r.snapshots ?? []) {
      const prev = snapByBureau.get(s.bureau);
      if (!prev) {
        snapByBureau.set(s.bureau, { ...s });
        continue;
      }
      if (prev.score == null && s.score != null) {
        snapByBureau.set(s.bureau, { ...prev, ...s, score: s.score });
      } else {
        snapByBureau.set(s.bureau, {
          ...prev,
          totalAccounts: prev.totalAccounts ?? s.totalAccounts,
          openAccounts: prev.openAccounts ?? s.openAccounts,
          closedAccounts: prev.closedAccounts ?? s.closedAccounts,
          negativeAccounts: prev.negativeAccounts ?? s.negativeAccounts,
          collections: prev.collections ?? s.collections,
          inquiries: prev.inquiries ?? s.inquiries,
          totalBalance: prev.totalBalance ?? s.totalBalance,
          utilization: prev.utilization ?? s.utilization,
        });
      }
    }
    for (const it of r.items ?? []) {
      const k = itemKey(it);
      if (!itemsByKey.has(k)) itemsByKey.set(k, it);
    }
  }

  let progressPeriod: string | null = null;
  let progressNext: string | null = null;
  for (const p of parts) {
    if (p.progress?.periodLabel && !progressPeriod) {
      progressPeriod = p.progress.periodLabel;
    }
    if (p.progress?.nextSteps && !progressNext) {
      progressNext = p.progress.nextSteps;
    }
  }
  const progress =
    progressPeriod || progressNext
      ? { periodLabel: progressPeriod, nextSteps: progressNext }
      : null;

  const mergedItems = [...itemsByKey.values()];
  const items = mergedItems.slice(0, EXTRACTION_ITEM_CEILING);
  if (mergedItems.length > EXTRACTION_ITEM_CEILING) {
    warnings.push(
      `Se omitieron ${mergedItems.length - EXTRACTION_ITEM_CEILING} ítems por el techo de extracción.`,
    );
  }

  if (
    documentKind === "UNKNOWN" &&
    (snapByBureau.size > 0 || items.length > 0)
  ) {
    documentKind = "CREDIT_BUREAU_REPORT";
    if (confidence === "low") confidence = "medium";
  }

  const hasClient = Object.values(clientAcc).some(
    (v) => typeof v === "string" && v.length > 0,
  );

  return withObservationQuality(
    creditPdfExtractionProposalSchema.parse({
      documentKind,
      confidence,
      warnings: warnings.slice(0, 30),
      client: hasClient ? clientAcc : null,
      report: {
        reportDate,
        provider,
        typeHint,
        notes,
        snapshots: [...snapByBureau.values()],
        items,
      },
      progress,
    }),
  );
}

export function withObservationQuality(
  proposal: CreditPdfExtractionProposal,
): CreditPdfExtractionProposal {
  const nextItems = (proposal.report?.items ?? []).map((item, index) => {
    const normalized = normalizeCreditObservation({
      rawItemId: `${item.bureau}-${index}`,
      reportId: "pdf-proposal",
      creditorName: item.creditorName,
      accountType: item.accountType,
      responsibility: item.responsibility,
      balance: item.balance,
      creditLimit: item.creditLimit,
      dateOpened: item.dateOpened,
      locator: {
        page: item.sourcePage ?? null,
        blockId: item.sourceWindow != null ? `window-${item.sourceWindow}` : null,
      },
    });
    return {
      ...item,
      fieldQuality: {
        family: normalized.family.value ?? "UNKNOWN",
        familyQuality: normalized.family.quality,
        ownership: normalized.ownership.value ?? "UNKNOWN",
        ownershipQuality: normalized.ownership.quality,
        balanceQuality: normalized.balance.quality,
        creditLimitQuality: normalized.creditLimit.quality,
      },
    };
  });
  return {
    ...proposal,
    report: proposal.report
      ? { ...proposal.report, items: nextItems }
      : proposal.report,
  };
}

/** Rellena scores faltantes desde heurística de texto (sin inventar). */
export function mergeHeuristicScores(
  proposal: CreditPdfExtractionProposal,
  sourceText: string,
): CreditPdfExtractionProposal {
  const heuristic = extractScoreSnapshotsFromText(sourceText);
  if (heuristic.length === 0) return proposal;

  const existing = proposal.report?.snapshots ?? [];
  const byBureau = new Map<string, Snapshot>();
  for (const s of existing) byBureau.set(s.bureau, { ...s });

  let filled = 0;
  for (const h of heuristic) {
    const prev = byBureau.get(h.bureau);
    if (!prev) {
      byBureau.set(h.bureau, { ...h });
      filled += 1;
    } else if (prev.score == null && h.score != null) {
      byBureau.set(h.bureau, { ...prev, score: h.score });
      filled += 1;
    }
  }

  if (filled === 0) return proposal;

  const warnings = [
    ...(proposal.warnings ?? []),
    "Scores completados desde el texto del PDF (heurística local); confirma antes de aplicar.",
  ].slice(0, 30);

  let documentKind = proposal.documentKind;
  let confidence = proposal.confidence;
  if (documentKind === "UNKNOWN") {
    documentKind = "CREDIT_BUREAU_REPORT";
    if (confidence === "low") confidence = "medium";
  }

  return creditPdfExtractionProposalSchema.parse({
    ...proposal,
    documentKind,
    confidence,
    warnings,
    report: {
      reportDate: proposal.report?.reportDate ?? null,
      provider: proposal.report?.provider ?? null,
      typeHint: proposal.report?.typeHint ?? null,
      notes: proposal.report?.notes ?? null,
      snapshots: [...byBureau.values()],
      items: proposal.report?.items ?? [],
    },
  });
}
