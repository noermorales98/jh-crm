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

/**
 * Etiquetas que se eliminan (la etiqueta; su contenido sigue como HTML normal).
 * Incluye las de texto crudo (`xmp`, `title`...), cuyo contenido el navegador no
 * analiza como etiquetas: si se dejaran, el filtro y el navegador leerían distinto.
 */
const DROPPED_TAGS = new Set([
  "script", "style", "iframe", "frame", "frameset", "object", "embed", "applet", "link", "meta",
  "base", "form", "input", "button", "textarea", "select", "option", "svg", "math", "template",
  "noscript", "portal", "xmp", "noembed", "noframes", "plaintext", "title", "video", "audio",
  "source", "track",
]);

/** Etiquetas cuyo contenido el navegador trata como texto crudo: se quita etiqueta y contenido. */
const RAW_TEXT_TAGS = new Set([
  "script", "style", "iframe", "textarea", "title", "xmp", "noembed", "noframes", "noscript",
]);

/** Atributos que cargan o navegan a una URL. */
const URL_ATTRS = new Set([
  "href", "src", "xlink:href", "action", "formaction", "background", "poster", "data", "cite",
  "longdesc", "usemap", "lowsrc", "dynsrc", "ping", "manifest", "codebase", "archive", "icon",
]);

/** Atributos que nunca hacen falta en un contrato y abren otra vía de ejecución o carga. */
const FORBIDDEN_ATTRS = new Set(["srcdoc", "srcset", "imagesrcset", "is", "ping"]);

const SAFE_TAG_NAME = /^[a-z][a-z0-9-]*$/;
const SAFE_ATTR_NAME = /^[a-z_:][a-z0-9_:.-]*$/;
/**
 * Estilos que ejecutan o cargan algo. Cualquier `\\` (escape CSS, `\\75rl(` = `url(`) o
 * comentario `/*` se rechaza entero: el contenido de un contrato no los necesita.
 * `position: fixed|sticky` también: permitiría tapar la página con un aviso falso.
 */
const DANGEROUS_STYLE =
  /\\|\/\*|expression\s*\(|javascript:|url\s*\(|image-set\s*\(|image\s*\(|cross-fade\s*\(|element\s*\(|src\s*\(|@import|behavior\s*:|-moz-binding|position\s*:\s*(?:fixed|sticky)/;

/** Solo imágenes rasterizadas en base64 (la firma del representante). */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i;

/** Espacio en blanco según HTML (no `\s` de JS, que incluye NBSP y otros). */
function isHtmlSpace(c: string | undefined): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";
}

function isAsciiAlpha(c: string | undefined): boolean {
  return c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
}

/** Minúsculas solo ASCII: no cambia la longitud (`İ`.toLowerCase() ocupa 2 unidades). */
function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/** Normaliza lo que un navegador ignora al resolver el esquema de una URL o un estilo. */
function normalizedScheme(value: string): string {
  return value
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
    return !(attr === "src" && SAFE_DATA_IMAGE.test(value.trim()));
  }
  return false;
}

/**
 * Un estilo con referencias de carácter con nombre (`url&lpar;` = `url(`) esquivaría la
 * lista; en vez de decodificarlas todas, solo se aceptan `&quot;`, `&#39;` y `&amp;`.
 */
function isDangerousStyle(value: string): boolean {
  if (/&(?!quot;|#39;|#x27;|amp;)/i.test(value)) return true;
  return DANGEROUS_STYLE.test(normalizedScheme(value));
}

type ParsedTag = {
  name: string;
  attrs: Array<{ name: string; value: string | null }>;
  selfClosing: boolean;
  /** Índice del `>` que cierra la etiqueta. */
  end: number;
};

/**
 * Lee una etiqueta como lo hace el tokenizador HTML (estados de nombre, atributo y
 * valor): una comilla solo abre un valor en el estado «antes del valor», un `=` al
 * empezar un nombre es parte del nombre, `/` cierra o separa. Devuelve `null` si la
 * entrada acaba dentro de la etiqueta (el navegador la descarta junto con el resto).
 * `start` apunta al primer carácter del nombre. Tiempo lineal.
 */
function parseTag(html: string, start: number): ParsedTag | null {
  const n = html.length;
  let i = start;
  while (i < n && !isHtmlSpace(html[i]) && html[i] !== "/" && html[i] !== ">") i += 1;
  const name = asciiLower(html.slice(start, i));
  const attrs: ParsedTag["attrs"] = [];
  let selfClosing = false;
  while (i < n) {
    const c = html[i]!;
    if (isHtmlSpace(c)) {
      i += 1;
      continue;
    }
    if (c === ">") return { name, attrs, selfClosing, end: i };
    if (c === "/") {
      i += 1;
      if (html[i] === ">") {
        selfClosing = true;
        return { name, attrs, selfClosing, end: i };
      }
      continue;
    }
    // Nombre de atributo: el primer carácter (aunque sea `=`) siempre forma parte.
    const nameStart = i;
    i += 1;
    while (i < n && !isHtmlSpace(html[i]) && html[i] !== "/" && html[i] !== ">" && html[i] !== "=") i += 1;
    const attrName = asciiLower(html.slice(nameStart, i));
    while (i < n && isHtmlSpace(html[i])) i += 1;
    if (html[i] !== "=") {
      attrs.push({ name: attrName, value: null });
      continue;
    }
    i += 1;
    while (i < n && isHtmlSpace(html[i])) i += 1;
    const q = html[i];
    if (q === '"' || q === "'") {
      const close = html.indexOf(q, i + 1);
      if (close === -1) return null;
      attrs.push({ name: attrName, value: html.slice(i + 1, close) });
      i = close + 1;
      continue;
    }
    if (q === ">") {
      attrs.push({ name: attrName, value: "" });
      continue;
    }
    const valueStart = i;
    while (i < n && !isHtmlSpace(html[i]) && html[i] !== ">") i += 1;
    attrs.push({ name: attrName, value: html.slice(valueStart, i) });
  }
  return null;
}

/** Reconstruye una etiqueta de apertura solo con lo que se analizó y se permite. */
function renderStartTag(tag: ParsedTag): string {
  const seen = new Set<string>();
  let out = `<${tag.name}`;
  for (const { name, value } of tag.attrs) {
    if (seen.has(name)) continue; // el navegador se queda con el primero
    seen.add(name);
    if (!SAFE_ATTR_NAME.test(name) || name.startsWith("on") || FORBIDDEN_ATTRS.has(name)) continue;
    if (value === null) {
      out += ` ${name}`;
      continue;
    }
    if (name === "style" && isDangerousStyle(value)) continue;
    const safe = URL_ATTRS.has(name) && isDangerousUrl(name, value) ? "#" : value;
    out += ` ${name}="${safe.replace(/\u0000/g, "\uFFFD").replace(/"/g, "&quot;")}"`;
  }
  return `${out}${tag.selfClosing ? " /" : ""}>`;
}

/** Busca `</name` seguido de espacio, `/`, `>` o fin (fin de texto crudo). */
function findRawTextEnd(lower: string, name: string, from: number): number {
  const needle = `</${name}`;
  let k = lower.indexOf(needle, from);
  while (k !== -1) {
    const after = lower[k + needle.length];
    if (after === undefined || isHtmlSpace(after) || after === "/" || after === ">") return k;
    k = lower.indexOf(needle, k + 1);
  }
  return -1;
}

/**
 * Recorre el HTML una vez, como el tokenizador del navegador, y lo reescribe:
 * - etiquetas: se reconstruyen desde lo analizado (sin `on*`, URLs peligrosas, etc.);
 * - etiquetas peligrosas: fuera; las de texto crudo, con su contenido;
 * - comentarios, `<!…>`, `<?…>` y `</…>` raros: fuera;
 * - `<` que no abre nada: `&lt;`;
 * - entrada que acaba dentro de una etiqueta: el resto, escapado como texto.
 * Lo que sale es exactamente lo que se revisó. Tiempo lineal.
 */
function sanitizeOnce(html: string): string {
  const lower = asciiLower(html);
  const n = html.length;
  let out = "";
  let i = 0;
  while (i < n) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      out += html.slice(i);
      break;
    }
    out += html.slice(i, lt);
    const c = html[lt + 1];

    if (isAsciiAlpha(c)) {
      const tag = parseTag(html, lt + 1);
      if (!tag) return out + escapeHtml(html.slice(lt));
      i = tag.end + 1;
      if (tag.name === "plaintext") break;
      if (RAW_TEXT_TAGS.has(tag.name)) {
        const close = findRawTextEnd(lower, tag.name, i);
        if (close === -1) break;
        const closeTag = parseTag(html, close + 2);
        if (!closeTag) break;
        i = closeTag.end + 1;
        continue;
      }
      if (!DROPPED_TAGS.has(tag.name) && SAFE_TAG_NAME.test(tag.name)) out += renderStartTag(tag);
      continue;
    }

    if (c === "/") {
      const d = html[lt + 2];
      if (isAsciiAlpha(d)) {
        const tag = parseTag(html, lt + 2);
        if (!tag) return out + escapeHtml(html.slice(lt));
        if (!DROPPED_TAGS.has(tag.name) && SAFE_TAG_NAME.test(tag.name)) out += `</${tag.name}>`;
        i = tag.end + 1;
        continue;
      }
      if (d === ">") {
        i = lt + 3;
        continue;
      }
      if (d === undefined) {
        out += "&lt;/";
        break;
      }
      const gt = html.indexOf(">", lt + 2); // comentario falso hasta el primer `>`
      if (gt === -1) break;
      i = gt + 1;
      continue;
    }

    if (c === "!" && html.startsWith("<!--", lt)) {
      const j = lt + 4;
      if (html[j] === ">") {
        i = j + 1;
        continue;
      }
      if (html.startsWith("->", j)) {
        i = j + 2;
        continue;
      }
      let k = html.indexOf("--", j);
      let end = -1;
      while (k !== -1) {
        if (html[k + 2] === ">") {
          end = k + 3;
          break;
        }
        if (html.startsWith("!>", k + 2)) {
          end = k + 4;
          break;
        }
        k = html.indexOf("--", k + 1);
      }
      if (end === -1) break; // comentario sin cerrar: el navegador no pinta el resto
      i = end;
      continue;
    }

    if (c === "!" || c === "?") {
      const gt = html.indexOf(">", lt + 2);
      if (gt === -1) break;
      i = gt + 1;
      continue;
    }

    out += "&lt;";
    i = lt + 1;
  }
  return out;
}

/**
 * Filtro de HTML de contratos. Recorre la entrada como el tokenizador del navegador y
 * reconstruye cada etiqueta permitida, en vez de quitar trozos con expresiones regulares.
 * Se repite hasta que no cambia (la salida ya es canónica; es una red de seguridad).
 */
export function sanitizeContractHtml(html: string): string {
  let current = html;
  for (let i = 0; i < 4; i += 1) {
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
