/**
 * CR-PDF-001 — extracción de texto / file PDF para importación de crédito.
 */
import { extractText, getDocumentProxy } from "unpdf";

const TEXT_THRESHOLD = 800;
const MAX_TEXT_CHARS = 60_000;

export type PdfExtractResult = {
  text: string;
  pageCount: number;
  mode: "text" | "sparse";
  charCount: number;
};

export async function extractPdfContent(
  pdfBytes: Uint8Array | Buffer,
): Promise<PdfExtractResult> {
  const data =
    pdfBytes instanceof Buffer ? new Uint8Array(pdfBytes) : pdfBytes;
  const pdf = await getDocumentProxy(data);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  const merged = (Array.isArray(text) ? text.join("\n\n") : String(text ?? ""))
    .replace(/\u0000/g, "")
    .trim();
  const clipped = merged.slice(0, MAX_TEXT_CHARS);
  const charCount = clipped.replace(/\s+/g, " ").trim().length;
  return {
    text: clipped,
    pageCount: totalPages,
    mode: charCount >= TEXT_THRESHOLD ? "text" : "sparse",
    charCount,
  };
}
