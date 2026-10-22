/**
 * CR-PDF-001 — extracción de texto / file PDF para importación de crédito.
 * El texto sale por página. No se recorta y no se adjunta el PDF.
 */
import { extractText, getDocumentProxy } from "unpdf";

const TEXT_THRESHOLD = 800;

export type PdfPageText = {
  page: number;
  text: string;
  empty: boolean;
};

export type PdfExtractResult = {
  text: string;
  pages: PdfPageText[];
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
  const { totalPages, text } = await extractText(pdf);
  const pageTexts = Array.isArray(text) ? text : [String(text ?? "")];
  const pages: PdfPageText[] = Array.from({ length: totalPages }, (_, index) => {
    const raw = String(pageTexts[index] ?? "").replace(/\u0000/g, "").trim();
    return { page: index + 1, text: raw, empty: raw.length === 0 };
  });
  const merged = pages
    .map((page) => page.text)
    .filter((value) => value.length > 0)
    .join("\n\n");
  const charCount = merged.replace(/\s+/g, " ").trim().length;
  return {
    text: merged,
    pages,
    pageCount: totalPages,
    mode: charCount >= TEXT_THRESHOLD ? "text" : "sparse",
    charCount,
  };
}
