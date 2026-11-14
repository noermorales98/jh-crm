/** Variables de fusión en plantillas de contrato (se sustituyen al emitir). */

import { escapeHtml, sanitizeContractHtml } from "@/src/lib/contracts/sanitize";

export const TEMPLATE_VARIABLES = {
  clientName: {
    token: "{{clientName}}",
    label: "Nombre del usuario",
  },
  clientFullName: {
    token: "{{clientFullName}}",
    label: "Nombre del usuario",
  },
} as const;

export type TemplateVariableKey = keyof typeof TEMPLATE_VARIABLES;

const TOKEN_RE = /\{\{(clientName|clientFullName)\}\}/g;

const USER_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.6-3.2 4.5-5 8-5s6.4 1.8 8 5"/></svg>`;

export function isTemplateVariableKey(value: string): value is TemplateVariableKey {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_VARIABLES, value);
}

export function getTemplateVariable(key: string) {
  return isTemplateVariableKey(key) ? TEMPLATE_VARIABLES[key] : null;
}

function alreadyWrapped(html: string, offset: number) {
  return /data-template-var\s*=/.test(html.slice(Math.max(0, offset - 80), offset));
}

/**
 * Sustituye cada token por su valor **escapado como HTML**. Los valores vienen
 * del cliente (nombre) y se muestran luego en el portal con `dangerouslySetInnerHTML`,
 * así que nunca se insertan en crudo.
 */
export function fillTemplateVariables(
  html: string,
  values: Record<TemplateVariableKey, string>,
): string {
  return html.replace(TOKEN_RE, (_match, key: TemplateVariableKey) => escapeHtml(values[key]));
}

/** Envuelve tokens sueltos para que TipTap los parsee como nodos. */
export function wrapTemplateVariablesInHtml(html: string): string {
  return html.replace(TOKEN_RE, (match, key: string, offset: number) => {
    if (alreadyWrapped(html, offset)) return match;
    return `<span data-template-var="${key}" class="jh-template-var">${match}</span>`;
  });
}

function stripTags(html: string) {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
}

/**
 * Vista de solo lectura: tokens pendientes se ven como chip;
 * valores ya sustituidos se muestran como texto normal.
 *
 * Seguridad: esta función reescribe el HTML, así que filtra **su propia salida**
 * (`sanitizeContractHtml` al final). Filtrar antes y reescribir después rompe los
 * límites de etiqueta que vio el filtro (`<img alt=<span data-template-var=..> onerror=..>`).
 * El icono SVG del chip (que el filtro quitaría) entra después, en el lugar de un
 * marcador aleatorio por llamada, y solo en la posición exacta del chip.
 */
export function presentContractHtml(html: string): string {
  const marker = `jhtplicon${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  const wrapped = wrapTemplateVariablesInHtml(html.split(marker).join(""));
  // Búsqueda lineal: cada apertura con `data-template-var` hasta el `</span>` más cercano.
  // (Antes un regex perezoso hasta `</span>`: cuadrático con muchas aperturas sin cierre.)
  const openRe = /<span\b[^<>]*>/g;
  let presented = "";
  let last = 0;
  for (let m = openRe.exec(wrapped); m; m = openRe.exec(wrapped)) {
    const keyMatch = /\bdata-template-var="([^"<>]+)"/.exec(m[0]);
    if (!keyMatch) continue;
    const innerStart = m.index + m[0].length;
    const close = wrapped.indexOf("</span>", innerStart);
    if (close === -1) break;
    const key = keyMatch[1]!;
    const inner = wrapped.slice(innerStart, close);
    const meta = getTemplateVariable(key);
    presented += wrapped.slice(last, m.index);
    presented +=
      meta && stripTags(inner) === meta.token
        ? `<span class="jh-template-var" data-template-var="${key}">${marker}<span>${meta.label}</span></span>`
        : inner;
    last = close + "</span>".length;
    openRe.lastIndex = last;
  }
  presented += wrapped.slice(last);
  // El icono entra solo donde el propio chip puso el marcador: justo tras la apertura
  // canónica del chip. Esa secuencia, con comillas sin escapar, solo puede ser marcado
  // real (el filtro escribe `"` como `&quot;` dentro de valores y `<` como `&lt;` en
  // texto). Cualquier otro marcador (p. ej. dentro de un atributo) se borra.
  const chipOpen = /(<span class="jh-template-var" data-template-var="(?:clientName|clientFullName)">)/;
  return sanitizeContractHtml(presented)
    .replace(new RegExp(`${chipOpen.source}${marker}`, "g"), `$1${USER_ICON_SVG}`)
    .split(marker)
    .join("");
}
