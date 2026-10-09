/**
 * CR-PDF-001 — classify + extract via OpenRouter (JSON tipado).
 * PR-SEC-PII: solo texto embebido ya redactado; nunca se adjunta el PDF.
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
import { redactBureauText } from "./redact";

/** Mínimo de caracteres útiles para llamar al modelo (alineado con pdf-text). */
const MIN_USEFUL_CHARS = 800;

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
    // Defensa: nunca persistir DOB/SSN propuestos por el modelo.
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

function chunkText(text: string): string {
  if (text.length <= 28_000) return text;
  const head = text.slice(0, 16_000);
  const midStart = Math.floor(text.length * 0.25);
  const mid = text.slice(midStart, midStart + 12_000);
  return `${head}\n\n---\n\n${mid}`;
}

/**
 * Extrae propuesta desde texto embebido del PDF.
 * No acepta ni envía bytes del archivo (PR-SEC-PII).
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
  const redacted = redactBureauText(chunkText(extract.text));
  const { text } = await generateText({
    model: createOpenRouterModel(),
    system: SYSTEM,
    prompt: `Archivo: ${fileName}\nPáginas: ${extract.pageCount}\nChars útiles: ${extract.charCount}\n\nTexto del PDF (PII redactada):\n${redacted}`,
    maxRetries: 1,
  });
  const proposal = normalizeProposal(parseJsonObject(text));
  if (
    !proposal.warnings.some((w) =>
      w.toLowerCase().includes("revis"),
    )
  ) {
    proposal.warnings = [
      ...proposal.warnings,
      "Extracción automática: revisa scores y cuentas antes de confirmar.",
    ];
  }
  return proposal;
}
