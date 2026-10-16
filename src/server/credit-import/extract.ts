/**
 * CR-PDF-001 — classify + extract via OpenRouter (JSON tipado).
 * PR-SEC-PII: solo texto embebido ya redactado; nunca se adjunta el PDF.
 *
 * PDFs grandes: ventanas de texto + merge (no un solo prompt truncado).
 * Scores: ventana dedicada + salvage Zod + heurística local del texto.
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
/** Máximo de llamadas OpenRouter por PDF (incluye 1 ventana de scores). */
export const AI_MAX_WINDOWS = 5;
/** Ventanas generales; se reserva 1 slot para scores cuando hay ancla. */
export const AI_GENERAL_WINDOWS = AI_MAX_WINDOWS - 1;

type Proposal = CreditPdfExtractionProposal;
type Snapshot = NonNullable<
  NonNullable<Proposal["report"]>["snapshots"]
>[number];

const BUREAUS = ["EXPERIAN", "EQUIFAX", "TRANSUNION"] as const;
type Bureau = (typeof BUREAUS)[number];

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
- Scores FICO/Vantage típicos 300-850; si dudoso, warning.
- Prioriza identidad (nombre), scores por buró y cuentas negativas.
- snapshots: MÁXIMO 3 (uno por buró EXPERIAN, EQUIFAX, TRANSUNION). Nunca más de 3.
- Máximo 200 items; prefiere negativos/colecciones.
- Para CLIENT_PROGRESS_REPORT: llena snapshots de scores; items [].
- Este fragmento puede ser PARCIAL (una ventana del PDF). Extrae solo lo que veas aquí.
- NO extraigas SSN, ITIN ni fecha de nacimiento: deja ssnLast4 y dateOfBirth siempre en null (el texto puede venir redactado).
- NO extraigas número de cuenta completo; solo accountNumberMasked si ya viene enmascarado (****1234).
- Fechas ISO YYYY-MM-DD solo para reportDate / cuentas, no DOB.`;

const SYSTEM_SCORES = `Eres un extractor de SCORES de buró para un CRM de reparación de crédito.
Responde SOLO JSON válido (sin markdown). Esta ventana prioriza scores.
{
  "documentKind": "CREDIT_BUREAU_REPORT" | "UNKNOWN",
  "confidence": "low" | "medium" | "high",
  "warnings": string[],
  "client": null,
  "report": {
    "reportDate": "YYYY-MM-DD"|null,
    "provider": string|null,
    "typeHint": null,
    "notes": null,
    "snapshots": [{"bureau":"EXPERIAN"|"EQUIFAX"|"TRANSUNION","score":number|null,"totalAccounts":null,"openAccounts":null,"closedAccounts":null,"negativeAccounts":null,"collections":null,"inquiries":null,"totalBalance":null,"utilization":null}],
    "items": []
  },
  "progress": null
}
Reglas:
- Busca scores FICO / VantageScore / "Credit Score" junto a Equifax, Experian o TransUnion.
- snapshots: EXACTAMENTE hasta 3 entradas (una por buró). Nunca más de 3.
- score entero 300–850; si no está claro para un buró, omite ese buró o score null.
- items SIEMPRE [].
- No inventes. No extraigas SSN ni DOB.`;

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

  if (Array.isArray(r.items) && r.items.length > 200) {
    r.items = r.items.slice(0, 200);
  }

  o.report = r;
  return o;
}

function normalizeProposal(raw: unknown): CreditPdfExtractionProposal {
  const coerced = coerceExtractionRaw(raw);
  const parsed = creditPdfExtractionProposalSchema.safeParse(coerced);
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
    coerced &&
    typeof coerced === "object" &&
    "documentKind" in coerced &&
    (coerced as { documentKind: string }).documentKind;
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
 * Parte el texto en ventanas solapadas (máx maxWindows).
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

/** Índice del primer ancla de scores en el texto (−1 si no hay). */
export function findScoreAnchorIndex(text: string): number {
  const lower = text.toLowerCase();
  const needles = [
    "credit score",
    "creditscore",
    "vantagescore",
    "vantage score",
    "fico",
    "your credit score",
  ];
  let best = -1;
  for (const n of needles) {
    const i = lower.indexOf(n);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

/**
 * Ventanas generales + (si hay ancla) 1 ventana centrada en scores.
 * scoreWindowIndex apunta a la ventana dedicada, o null.
 */
export function buildExtractionWindows(text: string): {
  windows: string[];
  scoreWindowIndex: number | null;
} {
  const t = text.trim();
  if (!t) return { windows: [], scoreWindowIndex: null };

  const anchor = findScoreAnchorIndex(t);
  if (anchor < 0) {
    return {
      windows: splitTextWindows(t, AI_TEXT_WINDOW, AI_TEXT_OVERLAP, AI_MAX_WINDOWS),
      scoreWindowIndex: null,
    };
  }

  const general = splitTextWindows(
    t,
    AI_TEXT_WINDOW,
    AI_TEXT_OVERLAP,
    AI_GENERAL_WINDOWS,
  );

  // Preferir contexto previo al ancla (títulos + tabla de scores).
  const lead = Math.min(2_000, Math.floor(AI_TEXT_WINDOW * 0.25));
  const start = Math.max(
    0,
    Math.min(anchor - lead, Math.max(0, t.length - AI_TEXT_WINDOW)),
  );
  const scoreWin = t.slice(start, start + AI_TEXT_WINDOW);

  // Si alguna ventana general ya cubre el ancla con margen, reutilizarla
  // como pass score-focused (evita duplicar y falsos positivos por padding).
  const step = Math.max(1, AI_TEXT_WINDOW - AI_TEXT_OVERLAP);
  let coveringIndex: number | null = null;
  for (let i = 0; i < general.length; i++) {
    const winStart = i * step;
    const winEnd = winStart + general[i].length;
    if (anchor >= winStart + 200 && anchor <= winEnd - 400) {
      coveringIndex = i;
      break;
    }
  }
  if (coveringIndex != null) {
    return { windows: general, scoreWindowIndex: coveringIndex };
  }

  if (general.length >= AI_MAX_WINDOWS) {
    // Sustituir la última ventana general por la dedicada a scores.
    const windows = [...general.slice(0, AI_MAX_WINDOWS - 1), scoreWin];
    return { windows, scoreWindowIndex: windows.length - 1 };
  }

  return {
    windows: [...general, scoreWin].slice(0, AI_MAX_WINDOWS),
    scoreWindowIndex: general.length,
  };
}

/**
 * Heurística local: buró + score 300–850 en el texto (no inventa).
 * Cubre patrones tipo "Equifax1 648 Fair Experian2 718" / "TransUnion3 721".
 */
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

  const items = [...itemsByKey.values()].slice(0, 200);
  if (itemsByKey.size > 200) {
    warnings.push("Se truncaron ítems fusionados a 200.");
  }

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

async function extractFromWindow(input: {
  windowText: string;
  fileName: string;
  pageCount: number;
  charCount: number;
  windowIndex: number;
  windowTotal: number;
  scoreFocused?: boolean;
}): Promise<CreditPdfExtractionProposal> {
  const redacted = redactBureauText(input.windowText);
  const safeName = sanitizeFileNameForAI(input.fileName);
  const focus = input.scoreFocused
    ? "FOCUS=scores (máx 3 snapshots; items [])"
    : "FOCUS=general";
  const { text } = await generateText({
    model: createOpenRouterModel(),
    system: input.scoreFocused ? SYSTEM_SCORES : SYSTEM,
    prompt: `Archivo: ${safeName}\nPáginas PDF: ${input.pageCount}\nChars totales útiles: ${input.charCount}\nVentana ${input.windowIndex + 1}/${input.windowTotal} (${focus})\n\nTexto parcial (PII redactada):\n${redacted}`,
    maxRetries: 1,
  });
  return normalizeProposal(parseJsonObject(text));
}

/**
 * Extrae propuesta desde texto embebido del PDF.
 * No acepta ni envía bytes del archivo (PR-SEC-PII).
 * PDFs largos: varias ventanas + mergeExtractionProposals + heurística de scores.
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
  const { windows, scoreWindowIndex } = buildExtractionWindows(extract.text);
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
        scoreFocused: scoreWindowIndex === i,
      }),
    );
  }

  let proposal = mergeExtractionProposals(parts);
  proposal = mergeHeuristicScores(proposal, extract.text);

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
