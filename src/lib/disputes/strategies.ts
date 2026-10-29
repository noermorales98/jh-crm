/**
 * Métodos de disputa: qué se disputa, con qué base legal y con qué carta.
 *
 * Bases (FCRA, 15 U.S.C. §1681):
 * - §611 (1681i): el buró debe reinvestigar lo disputado y borrar lo que no
 *   pueda verificar; §611(a)(7): a pedido, describir el procedimiento usado.
 * - §623 (1681s-2): el acreedor debe reportar datos exactos.
 * - §604 (1681b): una consulta exige un propósito permitido.
 * - §605 (1681c): límite de 7 años desde la primera morosidad.
 * Solo se disputa lo que el cliente considera inexacto o no verificable
 * (CROA §404: nada de declaraciones falsas).
 */

import type { CreditNegativeType } from "@prisma/client";

export const DISPUTE_STRATEGIES = [
  "ACCURACY_R1",
  "METHOD_R2",
  "LATE_PAYMENTS",
  "INQUIRY",
  "PERSONAL_INFO",
  "GENERAL",
] as const;

export type DisputeStrategy = (typeof DISPUTE_STRATEGIES)[number];

export type DisputeTarget = "ACCOUNT" | "INQUIRY" | "PERSONAL_INFO";

export type StrategyInfo = {
  label: string;
  short: string;
  /** Para qué sirve, en palabras simples. */
  when: string;
  basis: string;
  target: DisputeTarget;
  /** Orden recomendado dentro de una ronda (menor = antes). */
  order: number;
};

export const STRATEGY_INFO: Record<DisputeStrategy, StrategyInfo> = {
  PERSONAL_INFO: {
    label: "Información personal",
    short: "Info personal",
    when: "Nombres mal escritos, direcciones viejas o empleadores que no son del cliente. Va primero: limpia lo que liga cuentas ajenas.",
    basis: "FCRA §611",
    target: "PERSONAL_INFO",
    order: 1,
  },
  ACCURACY_R1: {
    label: "Exactitud entre burós (ronda 1)",
    short: "Exactitud R1",
    when: "Cobranzas, charge-offs y cuentas negativas con datos distintos o incompletos entre burós. Pide reinvestigar y borrar lo que no se pueda verificar.",
    basis: "FCRA §611 y §623",
    target: "ACCOUNT",
    order: 2,
  },
  INQUIRY: {
    label: "Consultas no autorizadas",
    short: "Consultas",
    when: "Consultas duras que el cliente no reconoce o sin una cuenta abierta asociada. El buró debe mostrar el propósito permitido.",
    basis: "FCRA §604 y §611",
    target: "INQUIRY",
    order: 3,
  },
  LATE_PAYMENTS: {
    label: "Pagos tardíos",
    short: "Pagos tardíos",
    when: "Cuentas con atrasos que el cliente dice que no ocurrieron o están mal fechados. Pide corregir el historial.",
    basis: "FCRA §611 y §623",
    target: "ACCOUNT",
    order: 4,
  },
  METHOD_R2: {
    label: "Método de verificación (ronda 2)",
    short: "Método R2",
    when: "Lo que el buró dijo que «verificó» en la ronda anterior. Exige describir cómo lo verificó, con quién y con qué documentos.",
    basis: "FCRA §611(a)(6)-(7)",
    target: "ACCOUNT",
    order: 5,
  },
  GENERAL: {
    label: "Disputa general FCRA",
    short: "General",
    when: "Cualquier otro dato inexacto que no encaje en los métodos anteriores.",
    basis: "FCRA §611",
    target: "ACCOUNT",
    order: 6,
  },
};

export function isDisputeStrategy(value: unknown): value is DisputeStrategy {
  return typeof value === "string" && (DISPUTE_STRATEGIES as readonly string[]).includes(value);
}

/** Etiqueta para métodos viejos (null = disputa general). */
export function strategyLabel(value: string | null | undefined): string {
  return isDisputeStrategy(value) ? STRATEGY_INFO[value].short : STRATEGY_INFO.GENERAL.short;
}

/**
 * Método sugerido para una cuenta: R2 si ya se disputó y el buró la
 * «verificó»; pagos tardíos si su problema son atrasos; R1 para el resto.
 */
export function suggestAccountStrategy(input: {
  negativeType: CreditNegativeType | null;
  previouslyVerified: boolean;
}): DisputeStrategy {
  if (input.previouslyVerified) return "METHOD_R2";
  if (input.negativeType === "LATE_PAYMENT") return "LATE_PAYMENTS";
  return "ACCURACY_R1";
}

export const PERSONAL_INFO_KINDS = ["NAME", "ADDRESS", "EMPLOYER", "PHONE", "OTHER"] as const;
export type PersonalInfoKind = (typeof PERSONAL_INFO_KINDS)[number];

export const PERSONAL_INFO_LABEL: Record<PersonalInfoKind, string> = {
  NAME: "Nombre",
  ADDRESS: "Dirección",
  EMPLOYER: "Empleador",
  PHONE: "Teléfono",
  OTHER: "Otro dato",
};

const PERSONAL_INFO_EN: Record<PersonalInfoKind, string> = {
  NAME: "Name",
  ADDRESS: "Address",
  EMPLOYER: "Employer",
  PHONE: "Phone number",
  OTHER: "Personal information",
};

export function personalInfoLabel(kind: PersonalInfoKind, value: string): string {
  return `${PERSONAL_INFO_EN[kind]}: ${value.trim()}`;
}

const HEADER = `{{client.fullName}}
{{client.address}}
{{client.city}}, {{client.state}} {{client.zip}}

{{date}}

{{bureau}}
Dispute Department
`;

const FOOTER = `
Please send me the results of your reinvestigation in writing, together with an updated copy of my credit report, as required by the Fair Credit Reporting Act.

Sincerely,

{{client.fullName}}

Enclosures: copy of government-issued ID and proof of address.
`;

/** Plantillas por método (en inglés: van al buró). {{items}} lista lo disputado. */
export const STRATEGY_TEMPLATES: Record<DisputeStrategy, { name: string; subject: string; content: string }> = {
  ACCURACY_R1: {
    name: "Exactitud entre burós (R1)",
    subject: "Dispute of inaccurate and unverifiable information (FCRA 611)",
    content: `${HEADER}
Re: Request for reinvestigation under 15 U.S.C. §1681i

To Whom It May Concern:

I am disputing the accounts listed below. The information you report for them is inaccurate or incomplete, and it does not match what the other credit bureaus report for the same accounts. Under 15 U.S.C. §1681i you must conduct a reasonable reinvestigation, and under §1681s-2 the furnisher must report accurate information. If an item cannot be fully verified as accurate, it must be deleted.

Disputed items:
{{items}}
${FOOTER}`,
  },
  METHOD_R2: {
    name: "Método de verificación (R2)",
    subject: "Request for the method of verification (FCRA 611(a)(7))",
    content: `${HEADER}
Re: Description of the reinvestigation procedure, 15 U.S.C. §1681i(a)(6)-(7)

To Whom It May Concern:

I previously disputed the accounts listed below and you reported them as verified. I am requesting a description of the procedure used to determine their accuracy, including the business name, address and telephone number of any furnisher contacted, as required by 15 U.S.C. §1681i(a)(7). Please provide it within 15 days of this request.

If you cannot show how these items were verified, they must be deleted.

Disputed items:
{{items}}
${FOOTER}`,
  },
  LATE_PAYMENTS: {
    name: "Pagos tardíos",
    subject: "Dispute of inaccurate late payment history (FCRA 611)",
    content: `${HEADER}
Re: Inaccurate payment history, 15 U.S.C. §1681i and §1681s-2

To Whom It May Concern:

The payment history reported for the accounts below is inaccurate. Please reinvestigate the late payments reported and correct the payment history, or delete the account if its accuracy cannot be verified.

Disputed items:
{{items}}
${FOOTER}`,
  },
  INQUIRY: {
    name: "Consultas no autorizadas",
    subject: "Dispute of unauthorized hard inquiries (FCRA 604)",
    content: `${HEADER}
Re: Inquiries without a permissible purpose, 15 U.S.C. §1681b and §1681i

To Whom It May Concern:

I do not recognize the hard inquiries listed below and I did not authorize them. Under 15 U.S.C. §1681b a consumer report may only be furnished for a permissible purpose. Please identify the user who requested each report and its permissible purpose, or delete the inquiry.

Disputed inquiries:
{{items}}
${FOOTER}`,
  },
  PERSONAL_INFO: {
    name: "Información personal",
    subject: "Request to correct personal information (FCRA 611)",
    content: `${HEADER}
Re: Inaccurate personal information in my file

To Whom It May Concern:

The personal information listed below is not mine or is out of date. Please remove it from my credit file. My correct information is the name and address at the top of this letter.

Information to remove:
{{items}}
${FOOTER}`,
  },
  GENERAL: {
    name: "Disputa general FCRA",
    subject: "Request for investigation under the FCRA",
    content: `${HEADER}
Re: Request for investigation, 15 U.S.C. §1681i

To Whom It May Concern:

I am disputing the information listed below because it is inaccurate. Please investigate it under the Fair Credit Reporting Act and correct or delete it.

Disputed items:
{{items}}
${FOOTER}`,
  },
};

/** Queja al CFPB por buró (se pega en consumerfinance.gov/complaint). */
export const CFPB_TEMPLATE = {
  name: "Queja al CFPB",
  subject: "CFPB complaint: incorrect information on my credit report",
  content: `Company: {{bureau}}
Product: Credit reporting
Issue: Incorrect information on your report / Problem with a company's investigation

What happened:
I disputed the items below with {{bureau}}. The information is inaccurate or could not be verified, and it remains on my report. Under 15 U.S.C. §1681i the company must conduct a reasonable reinvestigation and delete information that cannot be verified.

Items:
{{items}}

Desired resolution:
Delete or correct each item listed, send me the results in writing and a description of the procedure used to verify any item that remains (15 U.S.C. §1681i(a)(7)).

{{client.fullName}}
`,
};

/** Días que se esperan antes de revisar la respuesta (FCRA: 30 días; 45 con info nueva). */
export const REVIEW_DAYS = 30;
