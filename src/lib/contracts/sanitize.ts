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
 * Borrador de plantilla JH para revisión jurídica de Noe.
 * Incluye marcadores data-jh-section exigidos por el gate operativo (JH-011).
 * NO constituye asesoría legal ni cumplimiento CROA/GLBA certificado.
 */
export const JH_SERVICE_CONTRACT_DRAFT_HTML = `<p><em>BORRADOR JH — requiere revisión jurídica. No constituye asesoría legal ni certificación de cumplimiento.</em></p>
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
  <p>Los honorarios, cuotas y forma de pago se describirán en la cotización o plan de pago asociado a este expediente. <strong>[PENDIENTE REVISIÓN JURÍDICA: completar montos, calendario y restricciones de cobro anticipado aplicables.]</strong></p>
</div>
<div data-jh-section="cancellation">
  <h3>4. Cancelación</h3>
  <p>El Cliente puede cancelar este contrato dentro del plazo indicado al emitirlo (mínimo operativo de 3 días naturales desde el envío a firma, salvo que la revisión jurídica fije otro). La cancelación debe solicitarse por escrito a la Empresa. <strong>[PENDIENTE REVISIÓN JURÍDICA: alinear con derechos federales/estatales aplicables, p. ej. ventana de cancelación y avisos.]</strong></p>
</div>
<div data-jh-section="acknowledgement">
  <h3>5. Acuse</h3>
  <p>Al firmar, el Cliente confirma que ha leído este documento, entiende que es un borrador sujeto a la política de la Empresa y a la revisión jurídica pendiente, y acepta los términos aquí descritos en la medida en que resulten aplicables.</p>
</div>`;

/** @deprecated Prefer JH_SERVICE_CONTRACT_DRAFT_HTML — mismo contenido. */
export const DEFAULT_CONTRACT_CONTENT = JH_SERVICE_CONTRACT_DRAFT_HTML;
