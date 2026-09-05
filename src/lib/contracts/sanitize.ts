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

export const DEFAULT_CONTRACT_CONTENT = `<h2>Contrato de servicios</h2>
<p>Este contrato se celebra entre <strong>J&amp;H Multiservices LLC</strong> y <strong>{{clientName}}</strong> (el “Cliente”).</p>
<p>El Cliente contrata los servicios de reparación de crédito descritos por el asesor, conforme a las leyes aplicables y a las políticas de la empresa.</p>
<h3>1. Servicios</h3>
<p>La empresa trabajará de buena fe para disputar inexactitudes en los reportes de crédito del Cliente ante los burós correspondientes.</p>
<h3>2. Obligaciones del Cliente</h3>
<p>El Cliente proporcionará información veraz, documentos necesarios y mantendrá comunicación oportuna con su asesor.</p>
<h3>3. Cancelación</h3>
<p>El Cliente puede cancelar según los plazos indicados al emitir este contrato.</p>
<p>Al firmar, el Cliente confirma que ha leído y acepta estos términos.</p>`;
