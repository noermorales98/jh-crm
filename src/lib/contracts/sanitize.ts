/** Sanitiza HTML de contratos para vista segura (sin scripts ni eventos). */

import DOMPurify from "isomorphic-dompurify";

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
 * Etiquetas que puede llevar un contrato (lista cerrada: lo que no está aquí se elimina,
 * y su contenido de texto se conserva salvo en las de texto crudo/foráneo, que DOMPurify
 * quita con su contenido). `span`/`div` llevan los marcadores `data-jh-*` y los chips.
 */
const ALLOWED_TAGS = [
  "p", "br", "hr", "div", "span", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i",
  "u", "s", "strike", "sub", "sup", "small", "mark", "blockquote", "pre", "code", "ul", "ol", "li",
  "a", "img", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "col", "colgroup", "caption",
];

/**
 * Atributos permitidos (lista cerrada). Los `data-*` solo si se nombran aquí: los marcadores
 * de sección legal, los chips de variables y el bloque de firma de la agencia.
 */
const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "class", "style", "target", "rel", "colspan", "rowspan",
  "colwidth", "width", "height", "align", "start", "reversed", "type",
  "data-jh-section", "data-template-var", "data-jh-agency-signature",
];

/**
 * Estilos que ejecutan o cargan algo. Cualquier `\` (escape CSS, `\75rl(` = `url(`) o
 * comentario `/*` se rechaza entero: el contenido de un contrato no los necesita.
 * `position: fixed|sticky` también: permitiría tapar la página con un aviso falso.
 * El valor llega ya decodificado desde el DOM (`url&lpar;` ya es `url(`).
 */
const DANGEROUS_STYLE =
  /\\|\/\*|expression\s*\(|javascript:|url\s*\(|image-set\s*\(|image\s*\(|cross-fade\s*\(|element\s*\(|src\s*\(|attr\s*\(|@import|behavior\s*:|-moz-binding|position\s*:\s*(?:fixed|sticky)/;

export function isDangerousStyle(value: string): boolean {
  return DANGEROUS_STYLE.test(
    value
      .replace(/[\u0000-\u0020\u007f-\u009f]/g, "")
      .toLowerCase(),
  );
}

/** Solo imágenes rasterizadas en base64 (la firma del representante). */
const SAFE_DATA_IMAGE = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i;

let configured = false;

/** Ajustes de DOMPurify que no caben en la configuración: se registran una sola vez. */
function configure() {
  if (configured) return;
  configured = true;
  DOMPurify.removeAllHooks();
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = data.attrName.toLowerCase();
    const value = data.attrValue;
    if (name === "style" && isDangerousStyle(value)) {
      data.keepAttr = false;
      return;
    }
    // `data:` solo como imagen rasterizada en `src`; en cualquier otro sitio, fuera.
    if (/^[\s\u0000-\u001f]*data:/i.test(value) && !(name === "src" && SAFE_DATA_IMAGE.test(value.trim()))) {
      data.keepAttr = false;
    }
  });
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName === "A" && node.hasAttribute("target")) {
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

/**
 * Topes de entrada. DOMPurify construye un DOM completo, y con jsdom el coste crece de forma
 * cuadrática con la profundidad (20 000 `<div>` anidados: 78 s y desbordamiento de pila). Un
 * contrato real es poco profundo (una tabla con celdas y párrafos no pasa de ~10 niveles) pero
 * puede llevar miles de etiquetas; por eso el tope principal es la profundidad y el total de
 * aperturas solo acota el peor caso si el medidor se equivocara.
 */
const MAX_INPUT_CHARS = 1_000_000;
const MAX_OPEN_TAGS = 8000;
const MAX_DEPTH = 200;

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source",
  "track", "wbr",
]);
const RAW_TEXT_TAGS = new Set([
  "script", "style", "textarea", "title", "xmp", "noembed", "noframes", "iframe", "noscript",
  "plaintext",
]);

function isSpace(c: string | undefined): boolean {
  return c === " " || c === "\t" || c === "\n" || c === "\f" || c === "\r";
}

function isAlpha(c: string | undefined): boolean {
  return c !== undefined && ((c >= "a" && c <= "z") || (c >= "A" && c <= "Z"));
}

/**
 * Profundidad máxima de anidamiento, leyendo las etiquetas como el navegador: una comilla solo
 * abre un valor justo después de `=`, los comentarios y el texto crudo se saltan, y una etiqueta
 * de cierre solo resta si coincide con una abierta. Tiempo lineal. Devuelve `Infinity` si no puede
 * leer la entrada con seguridad (comilla sin cerrar). Se equivoca solo por exceso (`<p><p>`).
 */
export function estimateMaxDepth(html: string): number {
  const n = html.length;
  const lower = html.toLowerCase();
  const stack: string[] = [];
  const counts = new Map<string, number>();
  let max = 0;
  let i = html.indexOf("<");
  while (i !== -1 && i < n - 1) {
    const c = html[i + 1];
    if (c === "!" || c === "?") {
      const end = html.startsWith("<!--", i) ? html.indexOf("-->", i + 4) : html.indexOf(">", i + 2);
      if (end === -1) break;
      i = html.indexOf("<", end + 1);
      continue;
    }
    const closing = c === "/";
    const start = i + (closing ? 2 : 1);
    if (!isAlpha(html[start])) {
      i = html.indexOf("<", i + 1);
      continue;
    }
    let j = start;
    while (j < n && !isSpace(html[j]) && html[j] !== "/" && html[j] !== ">") j += 1;
    const name = lower.slice(start, j);
    let end = -1;
    // `afterName`: el último elemento leído es un nombre de atributo (un `=` ahora asigna valor).
    // Un `=` al empezar un nombre forma parte del nombre, como en el tokenizador del navegador.
    let afterName = false;
    while (j < n) {
      const ch = html[j]!;
      if (ch === ">") {
        end = j;
        break;
      }
      if (isSpace(ch)) {
        j += 1;
        continue;
      }
      if (ch === "/") {
        afterName = false;
        j += 1;
        continue;
      }
      if (ch === "=" && afterName) {
        j += 1;
        while (j < n && isSpace(html[j])) j += 1;
        const q = html[j];
        if (q === '"' || q === "'") {
          const close = html.indexOf(q, j + 1);
          if (close === -1) return Infinity;
          j = close + 1;
        }
        afterName = false;
        continue;
      }
      afterName = true;
      j += 1;
    }
    if (end === -1) break;
    i = html.indexOf("<", end + 1);
    if (closing) {
      if ((counts.get(name) ?? 0) > 0) {
        for (;;) {
          const top = stack.pop()!;
          counts.set(top, counts.get(top)! - 1);
          if (top === name) break;
        }
      }
      continue;
    }
    // Un `/>` solo cierra elementos vacíos (y contenido SVG/MathML): HTML lo ignora en `<div/>`.
    if (VOID_TAGS.has(name)) continue;
    if (RAW_TEXT_TAGS.has(name)) {
      const at = lower.indexOf(`</${name}`, end + 1);
      if (at === -1) break;
      const gt = html.indexOf(">", at);
      i = gt === -1 ? -1 : html.indexOf("<", gt + 1);
      continue;
    }
    stack.push(name);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (stack.length > max) max = stack.length;
  }
  return max;
}

/**
 * Filtro de HTML de contratos, con DOMPurify (`isomorphic-dompurify`: funciona igual en el
 * navegador y en el servidor, donde el portal también renderiza). Lista cerrada de etiquetas
 * y atributos, `data:` solo para imágenes rasterizadas, estilos filtrados por `isDangerousStyle`.
 * Ante entrada desmesurada, demasiado profunda o cualquier error, falla cerrado: devuelve el
 * texto escapado.
 */
export function sanitizeContractHtml(html: string): string {
  if (html.length > MAX_INPUT_CHARS) return escapeHtml(html);
  const opens = html.match(/<[a-z]/gi);
  if (opens && opens.length > MAX_OPEN_TAGS) return escapeHtml(html);
  if (opens && estimateMaxDepth(html) > MAX_DEPTH) return escapeHtml(html);
  try {
    configure();
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      KEEP_CONTENT: true,
      SANITIZE_NAMED_PROPS: true,
      WHOLE_DOCUMENT: false,
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
      RETURN_TRUSTED_TYPE: false,
    });
  } catch {
    return escapeHtml(html);
  }
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
