/**
 * Pipeline compartido: bytes PDF → extract → propuesta validada.
 * Usado por analyzeCreditPdf (sync/smoke) y jobs async.
 */
import { DomainError } from "@/src/server/errors";
import {
  creditPdfExtractionProposalSchema,
  type CreditPdfExtractionProposal,
} from "@/src/lib/validation/credit-import";
import { extractPdfContent, type PdfExtractResult } from "./pdf-text";
import { classifyAndExtractFromPdf } from "./extract";

export const CREDIT_PDF_MAX_BYTES = 12 * 1024 * 1024;

export type BuiltCreditPdfProposal = {
  proposal: CreditPdfExtractionProposal;
  extract: PdfExtractResult;
  suggestedReportType: "INITIAL" | "UPDATE" | "MANUAL";
};

export function suggestedReportTypeFromProposal(
  proposal: CreditPdfExtractionProposal,
): "INITIAL" | "UPDATE" | "MANUAL" {
  if (proposal.documentKind === "CLIENT_PROGRESS_REPORT") return "UPDATE";
  const hint = proposal.report?.typeHint;
  if (hint === "INITIAL" || hint === "UPDATE" || hint === "MANUAL") return hint;
  return "UPDATE";
}

export async function buildProposalFromDocumentBytes(input: {
  pdfBytes: Uint8Array | Buffer;
  fileName: string;
  windowSeed?: Parameters<typeof classifyAndExtractFromPdf>[0]["windowSeed"];
  concurrency?: number;
  onWindowStart?: Parameters<
    typeof classifyAndExtractFromPdf
  >[0]["onWindowStart"];
  onWindowComplete?: Parameters<
    typeof classifyAndExtractFromPdf
  >[0]["onWindowComplete"];
}): Promise<BuiltCreditPdfProposal> {
  if (input.pdfBytes.byteLength > CREDIT_PDF_MAX_BYTES) {
    throw new DomainError("El PDF supera 12 MB; divide o comprime el archivo.");
  }

  const extract = await extractPdfContent(input.pdfBytes);
  const proposal = await classifyAndExtractFromPdf({
    extract,
    fileName: input.fileName,
    windowSeed: input.windowSeed,
    concurrency: input.concurrency,
    onWindowStart: input.onWindowStart,
    onWindowComplete: input.onWindowComplete,
  });
  const validated = creditPdfExtractionProposalSchema.parse(proposal);

  return {
    proposal: validated,
    extract,
    suggestedReportType: suggestedReportTypeFromProposal(validated),
  };
}
