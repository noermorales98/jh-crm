/**
 * CR-PDF-001 — classify + extract via OpenRouter (JSON tipado).
 * PR-SEC-PII: solo texto embebido ya redactado; nunca se adjunta el PDF.
 *
 * PDFs grandes: ventanas de texto + merge (no un solo prompt truncado).
 */
import { generateText } from "ai";
import {
  createOpenRouterModel,
  isOpenRouterConfigured,
} from "@/src/lib/ai/openrouter";
import { DomainError } from "@/src/server/errors";
import {
  creditPdfExtractionProposalSchema,
  type CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";
import type { PdfExtractResult } from "./pdf-text";
import { redactBureauText, sanitizeFileNameForAI } from "./redact";

/** Mínimo de caracteres útiles para llamar al modelo (alineado con pdf-text). */
const MIN_USEFUL_CHARS = 800;

/** Tamaño de cada ventana enviada al modelo (chars). */
export const AI_TEXT_WINDOW = 14_000;
/** Solape entre ventanas consecutivas. */
export const AI_TEXT_OVERLAP = 1_500;
/** Máximo de llamadas OpenRouter por PDF. */
export const AI_MAX_WINDOWS = 5;

type Proposal = CreditPdfExtractionProposal;

function requireAi() {
  if (!isOpenRouterConfigured()) {
    throw new DomainError(
      "OpenRouter no está configurado (falta OPENROUTER_API_KEY).",
    );
  }
}

function parseJsonObject(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

const SYSTEM = `Eres un extractor de datos de PDFs de crédito para un CRM de reparación de crédito.
Responde SOLO JSON válido (sin markdown) con esta forma:
{
  "documentKind": "CREDIT_BUREAU_REPORT" | "CLIENT_PROGRESS_REPORT" | "UNKNOWN",
  "confidence": "low" | "medium" | "high",
  "warnings": string[],
  "client": {
    "firstName": string|null,
    "lastName": string|null,
    "addressLine1": string|null,
    "addressLine2": string|null,
    "city": string|null,
    "state": string|null,
    "postalCode": string|null,
    "country": string|null,
    "dateOfBirth": "YYYY-MM-DD"|null,
    "ssnLast4": "dddd"|null
  },
  "report": {
    "reportDate": "YYYY-MM-DD"|null,
    "provider": string|null,
    "typeHint": "INITIAL"|"UPDATE"|"MANUAL"|null,
    "notes": string|null,
    "snapshots": [{"bureau":"EXPERIAN"|"EQUIFAX"|"TRANSUNION","score":number|null,"totalAccounts":number|null,"openAccounts":number|null,"closedAccounts":number|null,"negativeAccounts":number|null,"collections":number|null,"inquiries":number|null,"totalBalance":number|null,"utilization":number|null}],
    "items": [{"creditorName":string,"accountNumberMasked":string|null,"accountType":string|null,"bureau":"EXPERIAN"|"EQUIFAX"|"TRANSUNION","balance":number|null,"creditLimit":number|null,"monthlyPayment":number|null,"dateOpened":"YYYY-MM-DD"|null,"dateReported":"YYYY-MM-DD"|null,"accountStatus":string|null,"paymentStatus":string|null,"negativeType":"COLLECTION"|"CHARGE_OFF"|"LATE_PAYMENT"|"REPOSSESSION"|"BANKRUPTCY"|"HARD_INQUIRY"|"FORECLOSURE"|"OTHER"|null,"remarks":string|null,"isNegative":boolean,"disputeEligible":boolean}]
  },
  "progress": { "periodLabel": string|null, "nextSteps": string|null }
}
Reglas:
- No inventes scores ni cuentas. Si no está en el texto, usa null / omite.
- Scores FICO típicos 300-850; si dudoso, warning.
- Prioriza identidad (nombre), scores por buró y cuentas negativas.
- Máximo 200 items; prefiere negativos/colecciones.
- Para CLIENT_PROGRESS_REPORT: llena snapshots de scores; items [].
- Este fragmento puede ser PARCIAL (una ventana del PDF). Extrae solo lo que veas aquí.
- NO extraigas SSN, ITIN ni fecha de nacimiento: deja ssnLast4 y dateOfBirth siempre en null (el texto puede venir redactado).
- NO extraigas número de cuenta completo; solo accountNumberMasked si ya viene enmascarado (****1234).
- Fechas ISO YYYY-MM-DD solo para reportDate / cuentas, no DOB.`;

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

function normalizeProposal(raw: unknown): CreditPdfExtractionProposal {
  const parsed = creditPdfExtractionProposalSchema.safeParse(raw);
  if (parsed.success) {
    const data = parsed.data;
    if (data.client) {
      data.client.dateOfBirth = null;
      data.client.ssnLast4 = null;
    }
    if (data.report?.items && data.report.items.length > 200) {
      data.report.items = data.report.items.slice(0, 200);
      data.warnings = [
        ...(data.warnings ?? []),
        "Se truncaron ítems a 200.",
      ];
    }
    return data;
  }

  const kind =
    raw &&
    typeof raw === "object" &&
    "documentKind" in raw &&
    (raw as { documentKind: string }).documentKind;
  return creditPdfExtractionProposalSchema.parse({
    documentKind:
      kind === "CREDIT_BUREAU_REPORT" ||
      kind === "CLIENT_PROGRESS_REPORT" ||
      kind === "UNKNOWN"
        ? kind
        : "UNKNOWN",
    confidence: "low",
    warnings: [
      "La IA devolvió JSON incompleto; revisa manualmente.",
      ...parsed.error.issues.slice(0, 5).map((i) => i.message),
    ],
    client: null,
    report: { snapshots: [], items: [] },
    progress: null,
  });
}

/**
 * Parte el texto en ventanas solapadas (máx AI_MAX_WINDOWS).
 * Exportado para smokes puros.
 */
export function splitTextWindows(
  text: string,
  windowSize = AI_TEXT_WINDOW,
  overlap = AI_TEXT_OVERLAP,
  maxWindows = AI_MAX_WINDOWS,
): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= windowSize) return [t];

  const step = Math.max(1, windowSize - overlap);
  const windows: string[] = [];
  for (let start = 0; start < t.length && windows.length < maxWindows; start += step) {
    windows.push(t.slice(start, start + windowSize));
    if (start + windowSize >= t.length) break;
  }

  // Asegurar cobertura del final si el loop quedó corto
  const lastStart = Math.max(0, t.length - windowSize);
  const tail = t.slice(lastStart);
  if (
    windows.length < maxWindows &&
    windows[windows.length - 1] !== tail &&
    !windows.some((w) => w.endsWith(tail.slice(-200)))
  ) {
    windows.push(tail);
  }

  return windows.slice(0, maxWindows);
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

  const snapByBureau = new Map<
    string,
    NonNullable<NonNullable<Proposal["report"]>["snapshots"]>[number]
  >();
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
      // Preferir score no nulo; si ambos, el de mayor confianza global ya se eligió — keep first non-null
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

  const items = [...itemsByKey.values()].slice(0, 200);
  if (itemsByKey.size > 200) {
    warnings.push("Se truncaron ítems fusionados a 200.");
  }

  // Si hay scores o negativos claros, no dejar UNKNOWN
  if (
    documentKind === "UNKNOWN" &&
    (snapByBureau.size > 0 || items.some((i) => i.isNegative))
  ) {
    documentKind = "CREDIT_BUREAU_REPORT";
    if (confidence === "low") confidence = "medium";
  }

  const hasClient = Object.values(clientAcc).some(
    (v) => typeof v === "string" && v.length > 0,
  );

  return creditPdfExtractionProposalSchema.parse({
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
  });
}

async function extractFromWindow(input: {
  windowText: string;
  fileName: string;
  pageCount: number;
  charCount: number;
  windowIndex: number;
  windowTotal: number;
}): Promise<CreditPdfExtractionProposal> {
  const redacted = redactBureauText(input.windowText);
  const safeName = sanitizeFileNameForAI(input.fileName);
  const { text } = await generateText({
    model: createOpenRouterModel(),
    system: SYSTEM,
    prompt: `Archivo: ${safeName}\nPáginas PDF: ${input.pageCount}\nChars totales útiles: ${input.charCount}\nVentana ${input.windowIndex + 1}/${input.windowTotal}\n\nTexto parcial (PII redactada):\n${redacted}`,
    maxRetries: 1,
  });
  return normalizeProposal(parseJsonObject(text));
}

/**
 * Extrae propuesta desde texto embebido del PDF.
 * No acepta ni envía bytes del archivo (PR-SEC-PII).
 * PDFs largos: varias ventanas + mergeExtractionProposals.
 */
export async function classifyAndExtractFromPdf(input: {
  extract: PdfExtractResult;
  fileName: string;
}): Promise<CreditPdfExtractionProposal> {
  const { extract, fileName } = input;

  if (extract.mode !== "text" || extract.charCount < MIN_USEFUL_CHARS) {
    return emptyManualReviewProposal([
      "PDF con poco texto embebido o escaneado; no se adjuntó el PDF al modelo ni se envió extracción automática. Completa a mano lo que falte y revisa con cuidado.",
    ]);
  }

  requireAi();
  const windows = splitTextWindows(extract.text);
  const parts: CreditPdfExtractionProposal[] = [];
  for (let i = 0; i < windows.length; i++) {
    parts.push(
      await extractFromWindow({
        windowText: windows[i],
        fileName,
        pageCount: extract.pageCount,
        charCount: extract.charCount,
        windowIndex: i,
        windowTotal: windows.length,
      }),
    );
  }

  const proposal = mergeExtractionProposals(parts);
  if (
    !proposal.warnings.some((w) => w.toLowerCase().includes("revis"))
  ) {
    proposal.warnings = [
      ...proposal.warnings,
      "Extracción automática: revisa scores y cuentas antes de confirmar.",
    ];
  }
  return proposal;
}
