/** Sanitiza HTML de contratos para vista segura (sin scripts ni eventos). */

/**
 * Escapa texto para insertarlo dentro de HTML (contenido o atributo entre comillas).
 * Todo valor que venga de un cliente u organización pasa por aquí antes de entrar
 * a `contentSnapshot`.
 */
export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|frame|frameset|object|embed|applet|link|meta|base|form|input|button|textarea|select|option|svg|math|template|noscript|portal)\b[^>]*>/gi;

/**
 * Atributos de evento (`onload`, `onerror`...). El navegador los acepta tras
 * espacio, `/` o una comilla de cierre (`<svg/onload=...>`, `<a""onclick=...>`),
 * así que se cubren todos esos separadores.
 */
const EVENT_HANDLER_ATTR = /([\s/"'`])on[a-z]+\s*=\s*("[^"]*"|'[^']*'|`[^`]*`|[^\s>]*)/gi;

/** Atributos que cargan o navegan a una URL. */
const URL_ATTR =
  /([\s/"'`])(href|src|xlink:href|action|formaction|background|poster|data)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Atributos que nunca hacen falta en un contrato y abren otra vía de ejecución. */
const FORBIDDEN_ATTR = /([\s/"'`])(srcdoc|srcset)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Estilos inline con `expression(` / `javascript:` / `url(`. */
const DANGEROUS_STYLE_ATTR = /([\s/"'`])style\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;

/** Solo imágenes rasterizadas en base64 (la firma del representante). */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i;

function unquote(value: string): string {
  const first = value[0];
  if ((first === '"' || first === "'" || first === "`") && value.endsWith(first)) {
    return value.slice(1, -1);
  }
  return value;
}

/** Normaliza lo que un navegador ignora al resolver el esquema de una URL. */
function normalizedScheme(value: string): string {
  return unquote(value)
    .replace(/&#x0*([0-9a-f]+);?/gi, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#0*([0-9]+);?/g, (_m, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&(?:tab|newline|colon);/gi, (m) => (m.toLowerCase() === "&colon;" ? ":" : ""))
    .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
    .toLowerCase();
}

function isDangerousUrl(attr: string, value: string): boolean {
  const url = normalizedScheme(value);
  if (/^(?:javascript|vbscript|livescript|mocha):/.test(url)) return true;
  if (url.startsWith("data:")) {
    return !(attr.toLowerCase() === "src" && SAFE_DATA_IMAGE.test(unquote(value).trim()));
  }
  return false;
}

/**
 * Recorre el HTML y pasa cada etiqueta de apertura completa a `fn`, en tiempo lineal.
 * Sigue la regla del navegador: una comilla solo abre un valor justo después de `=`
 * (`alt="a>b"` es una sola etiqueta; en `<a "x>` la comilla es un carácter más).
 * Un valor entre comillas sin cerrar hace que el navegador descarte la etiqueta y todo
 * lo que sigue; aquí ese resto se entrega escapado, como texto inerte.
 * (Sustituye a un regex con alternancia ambigua que retrocedía de forma exponencial.)
 */
function rewriteOpenTags(html: string, fn: (tag: string) => string): string {
  let out = "";
  let last = 0;
  let i = html.indexOf("<");
  while (i !== -1 && i < html.length - 1) {
    if (!/[a-z]/i.test(html[i + 1]!)) {
      i = html.indexOf("<", i + 1);
      continue;
    }
    let j = i + 1;
    let end = -1;
    while (j < html.length) {
      const c = html[j]!;
      if (c === ">") {
        end = j;
        break;
      }
      if (c === "=") {
        j += 1;
        while (j < html.length && /[\t\n\f\r ]/.test(html[j]!)) j += 1;
        const q = html[j];
        if (q === '"' || q === "'") {
          const close = html.indexOf(q, j + 1);
          if (close === -1) {
            // Comilla sin cerrar: el navegador no pinta nada desde aquí.
            return out + html.slice(last, i) + escapeHtml(html.slice(i));
          }
          j = close + 1;
        }
        continue;
      }
      j += 1;
    }
    if (end === -1) {
      // Etiqueta sin `>` hasta el final: tampoco se pinta; se entrega como texto.
      return out + html.slice(last, i) + escapeHtml(html.slice(i));
    }
    out += html.slice(last, i) + fn(html.slice(i, end + 1));
    last = end + 1;
    i = html.indexOf("<", last);
  }
  return out + html.slice(last);
}

/** Reglas de atributos: solo dentro de etiquetas, para no tocar el texto escapado. */
function sanitizeTag(tag: string): string {
  return tag
    .replace(EVENT_HANDLER_ATTR, "$1")
    .replace(FORBIDDEN_ATTR, "$1")
    .replace(URL_ATTR, (full, sep: string, attr: string, value: string) =>
      isDangerousUrl(attr, value) ? `${sep}${attr}="#"` : full,
    )
    .replace(DANGEROUS_STYLE_ATTR, (full, sep: string, value: string) =>
      /expression\s*\(|javascript:|url\s*\(|@import|behavior\s*:/i.test(normalizedScheme(value))
        ? sep
        : full,
    );
}

/**
 * Quita bloques `open … close` (con su contenido) en tiempo lineal. Sin cierre, quita
 * hasta el final: el navegador tampoco pinta lo que sigue a un `<script>`/`<!--` abierto.
 */
function stripBlocks(html: string, open: string, close: string): string {
  const lower = html.toLowerCase();
  let out = "";
  let last = 0;
  let i = lower.indexOf(open);
  while (i !== -1) {
    const c = lower.indexOf(close, i + open.length);
    if (c === -1) return out + html.slice(last, i);
    const end = close.endsWith(">") ? c + close.length : lower.indexOf(">", c + close.length);
    if (end === -1) return out + html.slice(last, i);
    out += html.slice(last, i);
    last = close.endsWith(">") ? end : end + 1;
    i = lower.indexOf(open, last);
  }
  return out + html.slice(last);
}

function sanitizeOnce(html: string): string {
  const stripped = stripBlocks(
    stripBlocks(stripBlocks(html, "<!--", "-->"), "<script", "</script"),
    "<style",
    "</style",
  )
    .replace(DANGEROUS_TAGS, "")
    .replace(/<\/?(?:script|style)\b[^>]*>/gi, "");
  return rewriteOpenTags(stripped, sanitizeTag);
}

/**
 * Filtro defensivo por expresiones regulares (no es un parser HTML).
 * Se repite hasta que el resultado deja de cambiar, para que un vector partido
 * (`<scr<script>ipt>`, `oonnload=`) no se reconstruya al quitar una pieza.
 */
export function sanitizeContractHtml(html: string): string {
  let current = html;
  for (let i = 0; i < 10; i += 1) {
    const next = sanitizeOnce(current);
    if (next === current) return next;
    current = next;
  }
  // No convergió: no se puede garantizar nada, se entrega como texto.
  return escapeHtml(html);
}

/**
 * Plantilla JH de contrato de servicio — **v1.0** (contenido aprobado por Noe, 2026-10-15).
 * Honorarios vía cotización/plan; cancelación mín. 3 días naturales; partes/servicios/acuse.
 * Marcadores `data-jh-section` exigidos por el gate operativo (JH-011).
 * NO constituye asesoría legal ni certificación CROA/GLBA/FCRA.
 */
export const JH_SERVICE_CONTRACT_HTML = `<p><em>Plantilla JH v1.0 — contenido aprobado por Noe (2026-10-15). No constituye asesoría legal ni certificación de cumplimiento CROA/FCRA/GLBA.</em></p>
<h2>Contrato de servicios de reparación de crédito</h2>
<div data-jh-section="parties">
  <h3>1. Partes</h3>
  <p>Este contrato se celebra entre <strong>J&amp;H Multiservices LLC</strong> (“la Empresa”) y <strong>{{clientName}}</strong> (“el Cliente”).</p>
</div>
<div data-jh-section="services">
  <h3>2. Servicios</h3>
  <p>La Empresa trabajará de buena fe para revisar y, cuando proceda, disputar información que el Cliente señale como inexacta en sus reportes de crédito ante los burós correspondientes. La Empresa no garantiza resultados específicos ni la eliminación de información exacta y verificable.</p>
</div>
<div data-jh-section="fees">
  <h3>3. Honorarios y cargos</h3>
  <p>Los honorarios, cuotas, montos y calendario de pago quedan definidos en la cotización o plan de pago asociado a este expediente. Este contrato no fija importes por sí mismo; rigen los del documento comercial vinculado.</p>
</div>
<div data-jh-section="cancellation">
  <h3>4. Cancelación</h3>
  <p>El Cliente puede cancelar este contrato dentro del plazo indicado al emitirlo, con un mínimo de 3 días naturales desde el envío a firma. La cancelación debe solicitarse por escrito a la Empresa.</p>
</div>
<div data-jh-section="acknowledgement">
  <h3>5. Acuse</h3>
  <p>Al firmar, el Cliente confirma que ha leído este documento, que los montos y el calendario de pago constan en la cotización o plan de pago asociado, y que acepta los términos aquí descritos en la medida en que resulten aplicables.</p>
</div>`;

/** @deprecated Use `JH_SERVICE_CONTRACT_HTML` (v1.0 published body). */
export const JH_SERVICE_CONTRACT_DRAFT_HTML = JH_SERVICE_CONTRACT_HTML;

/** Default TipTap seed content = published JH v1.0 template. */
export const DEFAULT_CONTRACT_CONTENT = JH_SERVICE_CONTRACT_HTML;

/** Published template version string for new JH defaults. */
export const JH_SERVICE_CONTRACT_VERSION = "1.0";
