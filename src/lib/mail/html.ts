/** Limpia HTML de correo para mostrarlo en un iframe aislado. */

const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|object|embed|link|meta|base|form|input|button|textarea|select)[^>]*>/gi;

export function looksQuotedPrintable(value: string): boolean {
  return /=3D/i.test(value) || /=\r\n/.test(value);
}

/** Decodifica quoted-printable (p. ej. dir=3D"ltr") a UTF-8. */
export function decodeQuotedPrintable(input: string): string {
  if (!looksQuotedPrintable(input)) return input;
  const stripped = input.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < stripped.length; i += 1) {
    if (stripped[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(stripped.slice(i + 1, i + 3))) {
      bytes.push(parseInt(stripped.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    bytes.push(stripped.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes).toString("utf8");
}

function extractDocumentParts(html: string): { inner: string; styles: string } {
  const styles = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)]
    .map((match) => match[1] ?? "")
    .filter((css) => css.trim() && !/@import/i.test(css))
    .join("\n")
    .replace(/<\/style/gi, "");

  const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const inner = bodyMatch
    ? (bodyMatch[1] ?? "")
    : html
        .replace(/<head\b[\s\S]*?<\/head>/gi, "")
        .replace(/<\/?html\b[^>]*>/gi, "")
        .replace(/<\/?body\b[^>]*>/gi, "");

  return { inner, styles };
}

export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(DANGEROUS_TAGS, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|xlink:href)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, "$1=$2#$2")
    .replace(/(href|src)\s*=\s*(['"])\s*data:text\/html[^'"]*\2/gi, "$1=$2#$2");
}

export function wrapEmailHtml(html: string): string {
  const { inner, styles } = extractDocumentParts(decodeQuotedPrintable(html));
  const safe = sanitizeEmailHtml(inner);
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base target="_blank">
<style>
  html, body { margin: 0; background: #fff; overflow: visible !important; height: auto !important; }
  body {
    padding: 4px 0 8px;
    color: #111;
    font: 15px/1.55 ui-sans-serif, system-ui, sans-serif;
    word-wrap: break-word;
    overflow-wrap: anywhere;
  }
  img, video { max-width: 100%; height: auto; }
  table { max-width: 100%; }
  a { color: #4f46e5; }
</style>
${styles ? `<style>${styles}</style>` : ""}
</head>
<body>${safe}</body>
</html>`;
}

export function embedCidImages(
  html: string,
  attachments: { contentId?: string | null; contentType?: string | null; content?: Buffer }[],
): string {
  let out = html;
  for (const att of attachments) {
    if (!att.contentId || !att.content || att.content.length === 0) continue;
    const cid = att.contentId.replace(/^<|>$/g, "");
    if (!cid) continue;
    const mime = att.contentType || "application/octet-stream";
    const dataUrl = `data:${mime};base64,${att.content.toString("base64")}`;
    out = out.replaceAll(new RegExp(`cid:${cid.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "gi"), dataUrl);
  }
  return out;
}
