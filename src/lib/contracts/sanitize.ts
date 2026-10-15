/** Sanitiza HTML de contratos para vista segura (sin scripts ni eventos). */

const DANGEROUS_TAGS =
  /<\/?(?:script|iframe|object|embed|link|meta|base|form|input|button|textarea|select)[^>]*>/gi;

export function sanitizeContractHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(DANGEROUS_TAGS, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(href|src|xlink:href)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, "$1=$2#$2");
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
