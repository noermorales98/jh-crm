/**
 * CR-PDF-001 — classify + extract via OpenRouter (JSON tipado).
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
- Prioriza identidad, scores por buró y cuentas negativas.
- Máximo 200 items; prefiere negativos/colecciones.
- Para CLIENT_PROGRESS_REPORT: llena snapshots de scores; items [].
- ssnLast4 solo 4 dígitos; NUNCA el SSN completo en el JSON.
- Fechas ISO YYYY-MM-DD.`;

function normalizeProposal(raw: unknown): CreditPdfExtractionProposal {
  const parsed = creditPdfExtractionProposalSchema.safeParse(raw);
  if (parsed.success) {
    const data = parsed.data;
    // Drop invalid scores already handled by zod; trim items
    if (data.report?.items && data.report.items.length > 200) {
      data.report.items = data.report.items.slice(0, 200);
      data.warnings = [
        ...(data.warnings ?? []),
        "Se truncaron ítems a 200.",
      ];
    }
    return data;
  }

  // Soft recover: kind + empty
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
  // Prefer head (identity/scores) + a mid slice for accounts
  if (text.length <= 28_000) return text;
  const head = text.slice(0, 16_000);
  const midStart = Math.floor(text.length * 0.25);
  const mid = text.slice(midStart, midStart + 12_000);
  return `${head}\n\n---\n\n${mid}`;
}

export async function classifyAndExtractFromPdf(input: {
  extract: PdfExtractResult;
  pdfBytes?: Buffer;
  fileName: string;
}): Promise<CreditPdfExtractionProposal> {
  requireAi();
  const { extract, pdfBytes, fileName } = input;

  if (extract.mode === "text") {
    const { text } = await generateText({
      model: createOpenRouterModel(),
      system: SYSTEM,
      prompt: `Archivo: ${fileName}\nPáginas: ${extract.pageCount}\nChars útiles: ${extract.charCount}\n\nTexto del PDF:\n${chunkText(extract.text)}`,
      maxRetries: 1,
    });
    return normalizeProposal(parseJsonObject(text));
  }

  // Sparse text: try multimodal file if bytes available and small enough
  if (pdfBytes && pdfBytes.byteLength <= 4_5 * 1024 * 1024) {
    const { text } = await generateText({
      model: createOpenRouterModel(),
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Archivo: ${fileName}. Páginas≈${extract.pageCount}. Texto embebido escaso (${extract.charCount} chars). Extrae del PDF adjunto. Texto parcial:\n${extract.text.slice(0, 2000)}`,
            },
            {
              type: "file",
              data: pdfBytes,
              mediaType: "application/pdf",
              filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
            },
          ],
        },
      ],
      maxRetries: 1,
    });
    const proposal = normalizeProposal(parseJsonObject(text));
    if (!proposal.warnings.some((w) => w.includes("escaso"))) {
      proposal.warnings = [
        ...proposal.warnings,
        "PDF con poco texto embebido; extracción multimodal — revisa con cuidado.",
      ];
    }
    return proposal;
  }

  // Last resort: sparse text only
  const { text } = await generateText({
    model: createOpenRouterModel(),
    system: SYSTEM,
    prompt: `Archivo: ${fileName}. Texto muy limitado (${extract.charCount} chars). Extrae lo posible; marca confidence low.\n\n${extract.text}`,
    maxRetries: 1,
  });
  const proposal = normalizeProposal(parseJsonObject(text));
  proposal.confidence = "low";
  proposal.warnings = [
    ...proposal.warnings,
    "No se pudo adjuntar el PDF al modelo; solo texto escaso.",
  ];
  return proposal;
}
