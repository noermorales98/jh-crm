/**
 * Fetch and normalize an org logo for jsPDF headers.
 * Failures return null so PDF generation never breaks on a bad URL.
 */

export type PdfLogoFormat = "PNG" | "JPEG";

export type PdfLogo = {
  dataUrl: string;
  format: PdfLogoFormat;
  /** Intrinsic pixel size when known (PNG/JPEG headers). */
  pixelWidth?: number;
  pixelHeight?: number;
};

const MAX_BYTES = 512_000;
const FETCH_MS = 5_000;

function pngSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4e || buf[3] !== 0x47) {
    return null;
  }
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

/** Locate SOF0/SOF2 dimensions in a JPEG buffer. */
function jpegSize(buf: Buffer): { w: number; h: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i += 1;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = buf.readUInt16BE(i + 2);
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      const h = buf.readUInt16BE(i + 5);
      const w = buf.readUInt16BE(i + 7);
      if (w > 0 && h > 0) return { w, h };
    }
    i += 2 + len;
  }
  return null;
}

function detectFormat(
  buf: Buffer,
  contentType: string | null,
): PdfLogoFormat | null {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("png") || pngSize(buf)) return "PNG";
  if (ct.includes("jpeg") || ct.includes("jpg") || jpegSize(buf)) return "JPEG";
  if (buf[0] === 0x89 && buf[1] === 0x50) return "PNG";
  if (buf[0] === 0xff && buf[1] === 0xd8) return "JPEG";
  return null;
}

/**
 * Download a remote logo for PDF use. Only http(s); size-capped; soft-fail.
 */
export async function fetchLogoForPdf(
  logoUrl: string | null | undefined,
): Promise<PdfLogo | null> {
  const url = logoUrl?.trim();
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { Accept: "image/png,image/jpeg,image/*;q=0.8" },
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return null;
    const format = detectFormat(buf, res.headers.get("content-type"));
    if (!format) return null;
    const size = format === "PNG" ? pngSize(buf) : jpegSize(buf);
    const b64 = buf.toString("base64");
    const mime = format === "PNG" ? "image/png" : "image/jpeg";
    return {
      dataUrl: `data:${mime};base64,${b64}`,
      format,
      pixelWidth: size?.w,
      pixelHeight: size?.h,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fit logo into a max box (mm), preserving aspect when pixel size is known. */
export function logoBoxMm(
  logo: PdfLogo,
  maxW = 36,
  maxH = 12,
): { widthMm: number; heightMm: number } {
  const pw = logo.pixelWidth;
  const ph = logo.pixelHeight;
  if (!pw || !ph || pw <= 0 || ph <= 0) {
    return { widthMm: Math.min(maxW, 28), heightMm: maxH };
  }
  const scale = Math.min(maxW / pw, maxH / ph);
  return {
    widthMm: Math.max(4, pw * scale),
    heightMm: Math.max(4, ph * scale),
  };
}
