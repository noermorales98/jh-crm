/** Variables de fusión en plantillas de contrato (se sustituyen al emitir). */

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
  return value in TEMPLATE_VARIABLES;
}

export function getTemplateVariable(key: string) {
  return isTemplateVariableKey(key) ? TEMPLATE_VARIABLES[key] : null;
}

function alreadyWrapped(html: string, offset: number) {
  return /data-template-var\s*=/.test(html.slice(Math.max(0, offset - 80), offset));
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
 */
export function presentContractHtml(html: string): string {
  const wrapped = wrapTemplateVariablesInHtml(html);
  return wrapped.replace(
    /<span([^>]*\bdata-template-var="([^"]+)"[^>]*)>([\s\S]*?)<\/span>/g,
    (_full, _attrs: string, key: string, inner: string) => {
      const text = stripTags(inner);
      const meta = getTemplateVariable(key);
      if (meta && text === meta.token) {
        return `<span class="jh-template-var" data-template-var="${key}">${USER_ICON_SVG}<span>${meta.label}</span></span>`;
      }
      return inner;
    },
  );
}
