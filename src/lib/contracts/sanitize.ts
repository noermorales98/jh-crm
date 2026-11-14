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
  /\\|\/\*|expression\s*\(|javascript:|url\s*\(|image-set\s*\(|image\s*\(|cross-fade\s*\(|element\s*\(|src\s*\(|@import|behavior\s*:|-moz-binding|position\s*:\s*(?:fixed|sticky)/;

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
 * contrato real tiene decenas de etiquetas; pasado el tope se entrega como texto inerte.
 * Contar aperturas (`<letra`) solo puede sobrestimar la profundidad, nunca subestimarla.
 */
const MAX_INPUT_CHARS = 1_000_000;
const MAX_OPEN_TAGS = 1500;

/**
 * Filtro de HTML de contratos, con DOMPurify (`isomorphic-dompurify`: funciona igual en el
 * navegador y en el servidor, donde el portal también renderiza). Lista cerrada de etiquetas
 * y atributos, `data:` solo para imágenes rasterizadas, estilos filtrados por `isDangerousStyle`.
 * Ante entrada desmesurada o cualquier error, falla cerrado: devuelve el texto escapado.
 */
export function sanitizeContractHtml(html: string): string {
  if (html.length > MAX_INPUT_CHARS) return escapeHtml(html);
  const opens = html.match(/<[a-z]/gi);
  if (opens && opens.length > MAX_OPEN_TAGS) return escapeHtml(html);
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
