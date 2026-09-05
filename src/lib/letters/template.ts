/**
 * Sustitución simple de variables en plantillas de cartas.
 * No ejecuta lógica; solo reemplazo exacto de {{clave}}.
 */

export type LetterTemplateVars = Record<string, string>;

export function renderTemplate(content: string, vars: LetterTemplateVars): string {
  return content.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
    return vars[key] ?? "";
  });
}

export const LETTER_VARIABLE_HINTS = [
  "client.fullName",
  "client.address",
  "client.city",
  "client.state",
  "client.zip",
  "bureau",
  "creditor",
  "accountNumber",
  "disputeReason",
  "date",
  "organization.legalName",
] as const;

export const DEFAULT_LETTER_CONTENT = `{{organization.legalName}}
On behalf of: {{client.fullName}}
{{client.address}}
{{client.city}}, {{client.state}} {{client.zip}}

{{date}}

{{bureau}}
Dispute Department

Re: Request for investigation — {{creditor}} (Account {{accountNumber}})

To Whom It May Concern:

I am writing to dispute the following information on my credit report. Please investigate this item under the Fair Credit Reporting Act.

Creditor: {{creditor}}
Account: {{accountNumber}}
Reason: {{disputeReason}}

Please provide the results of your investigation in writing.

Sincerely,
{{client.fullName}}
`;
