/**
 * JH-011 / TEST-011 — gate operativo de completitud contractual.
 *
 * Bloquea envío incompleto (secciones, versión, plazos, tokens sin resolver).
 * NO constituye asesoría legal ni certificación CROA/GLBA/FCRA.
 * Política de cancelación mín. 3 días: contenido plantilla JH v1.0 (Noe, 2026-10-15).
 */

export const MIN_CANCELLATION_DEADLINE_DAYS = 3;

/** Secciones que el contenido debe marcar con data-jh-section. */
export const REQUIRED_CONTRACT_SECTIONS = [
  "parties",
  "services",
  "fees",
  "cancellation",
  "acknowledgement",
] as const;

export type RequiredContractSection = (typeof REQUIRED_CONTRACT_SECTIONS)[number];

export type ContractSendReadinessInput = {
  title?: string | null;
  version?: string | null;
  contentHtml?: string | null;
  cancellationDeadline?: Date | null;
  cancellationDeadlineDays?: number | null;
  /** Si true, se permite deadline futuro calculado desde days. */
  now?: Date;
};

export type ContractGateIssue = {
  code:
    | "MISSING_TITLE"
    | "MISSING_VERSION"
    | "INVALID_VERSION"
    | "EMPTY_CONTENT"
    | "MISSING_SECTION"
    | "UNRESOLVED_TOKENS"
    | "MISSING_DEADLINE"
    | "DEADLINE_TOO_SHORT"
    | "DEADLINE_IN_PAST";
  message: string;
  section?: RequiredContractSection;
};

const TOKEN_RE = /\{\{(clientName|clientFullName)\}\}/g;
const SECTION_RE = /data-jh-section\s*=\s*["']([^"']+)["']/gi;

export function findRequiredSections(contentHtml: string): RequiredContractSection[] {
  const found = new Set<string>();
  for (const match of contentHtml.matchAll(SECTION_RE)) {
    const key = (match[1] ?? "").trim().toLowerCase();
    if ((REQUIRED_CONTRACT_SECTIONS as readonly string[]).includes(key)) {
      found.add(key);
    }
  }
  return REQUIRED_CONTRACT_SECTIONS.filter((s) => found.has(s));
}

export function missingRequiredSections(
  contentHtml: string,
): RequiredContractSection[] {
  const present = new Set(findRequiredSections(contentHtml));
  return REQUIRED_CONTRACT_SECTIONS.filter((s) => !present.has(s));
}

export function hasUnresolvedTemplateTokens(contentHtml: string): boolean {
  TOKEN_RE.lastIndex = 0;
  return TOKEN_RE.test(contentHtml);
}

export function isValidContractVersion(version: string): boolean {
  const v = version.trim();
  if (!v || v.length > 40) return false;
  // Semver-ish or simple "1", "1.0", "2026.10"
  return /^[A-Za-z0-9]+([._-][A-Za-z0-9]+)*$/.test(v);
}

export function assertCancellationDeadlineDays(
  days: number | null | undefined,
): ContractGateIssue | null {
  if (days == null || !Number.isFinite(days)) {
    return {
      code: "MISSING_DEADLINE",
      message:
        "Debes indicar el plazo de cancelación en días antes de crear o enviar el contrato.",
    };
  }
  const n = Math.floor(days);
  if (n < MIN_CANCELLATION_DEADLINE_DAYS) {
    return {
      code: "DEADLINE_TOO_SHORT",
      message: `El plazo de cancelación mínimo operativo es ${MIN_CANCELLATION_DEADLINE_DAYS} días naturales (política JH v1.0).`,
    };
  }
  if (n > 365) {
    return {
      code: "DEADLINE_TOO_SHORT",
      message: "El plazo de cancelación no puede superar 365 días.",
    };
  }
  return null;
}

/**
 * Evalúa si un contrato puede pasar de DRAFT → SENT.
 * Pure: no I/O. No afirma validez jurídica.
 */
export function evaluateContractSendReadiness(
  input: ContractSendReadinessInput,
): { ok: true } | { ok: false; issues: ContractGateIssue[] } {
  const issues: ContractGateIssue[] = [];
  const title = (input.title ?? "").trim();
  const version = (input.version ?? "").trim();
  const contentHtml = (input.contentHtml ?? "").trim();
  const now = input.now ?? new Date();

  if (!title) {
    issues.push({
      code: "MISSING_TITLE",
      message: "El contrato no tiene título.",
    });
  }
  if (!version) {
    issues.push({
      code: "MISSING_VERSION",
      message: "La versión del contrato es obligatoria.",
    });
  } else if (!isValidContractVersion(version)) {
    issues.push({
      code: "INVALID_VERSION",
      message: "La versión del contrato no es válida.",
    });
  }
  if (!contentHtml) {
    issues.push({
      code: "EMPTY_CONTENT",
      message: "El contenido del contrato está vacío.",
    });
  } else {
    for (const section of missingRequiredSections(contentHtml)) {
      issues.push({
        code: "MISSING_SECTION",
        section,
        message: `Falta la sección obligatoria «${section}» (data-jh-section).`,
      });
    }
    if (hasUnresolvedTemplateTokens(contentHtml)) {
      issues.push({
        code: "UNRESOLVED_TOKENS",
        message:
          "Quedan variables de plantilla sin resolver (p. ej. {{clientName}}). No se puede enviar.",
      });
    }
  }

  const daysIssue = assertCancellationDeadlineDays(input.cancellationDeadlineDays);
  if (input.cancellationDeadline == null && input.cancellationDeadlineDays == null) {
    issues.push({
      code: "MISSING_DEADLINE",
      message:
        "Falta la fecha límite de cancelación. No se puede enviar un contrato incompleto.",
    });
  } else if (input.cancellationDeadlineDays != null && daysIssue) {
    issues.push(daysIssue);
  } else if (input.cancellationDeadline != null) {
    if (input.cancellationDeadline.getTime() <= now.getTime()) {
      issues.push({
        code: "DEADLINE_IN_PAST",
        message: "La fecha límite de cancelación ya venció.",
      });
    } else {
      const ms = input.cancellationDeadline.getTime() - now.getTime();
      const daysLeft = ms / (24 * 60 * 60 * 1000);
      if (daysLeft + 1e-9 < MIN_CANCELLATION_DEADLINE_DAYS) {
        issues.push({
          code: "DEADLINE_TOO_SHORT",
          message: `El plazo de cancelación restante es menor a ${MIN_CANCELLATION_DEADLINE_DAYS} días.`,
        });
      }
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true };
}

/** Formatea issues para DomainError / UI. */
export function formatContractGateIssues(issues: ContractGateIssue[]): string {
  return issues.map((i) => i.message).join(" ");
}

/**
 * Valida plantilla activa: secciones + versión.
 * No exige tokens resueltos (eso ocurre al emitir).
 */
export function evaluateTemplateCompleteness(input: {
  name?: string | null;
  version?: string | null;
  contentHtml?: string | null;
  active?: boolean;
}): { ok: true } | { ok: false; issues: ContractGateIssue[] } {
  const issues: ContractGateIssue[] = [];
  const name = (input.name ?? "").trim();
  const version = (input.version ?? "").trim();
  const contentHtml = (input.contentHtml ?? "").trim();

  if (!name) {
    issues.push({
      code: "MISSING_TITLE",
      message: "El nombre de la plantilla es obligatorio.",
    });
  }
  if (!version) {
    issues.push({
      code: "MISSING_VERSION",
      message: "La versión de la plantilla es obligatoria.",
    });
  } else if (!isValidContractVersion(version)) {
    issues.push({
      code: "INVALID_VERSION",
      message: "La versión de la plantilla no es válida.",
    });
  }
  if (!contentHtml) {
    issues.push({
      code: "EMPTY_CONTENT",
      message: "El contenido de la plantilla está vacío.",
    });
  } else if (input.active !== false) {
    for (const section of missingRequiredSections(contentHtml)) {
      issues.push({
        code: "MISSING_SECTION",
        section,
        message: `La plantilla activa debe incluir la sección «${section}» (data-jh-section).`,
      });
    }
  }

  if (issues.length) return { ok: false, issues };
  return { ok: true };
}
