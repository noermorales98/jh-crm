import type { CaseState } from "@prisma/client";

export type CaseSectionKey =
  | "summary"
  | "credito"
  | "rondas"
  | "documentos"
  | "tareas"
  | "cotizaciones"
  | "pagos"
  | "cartas";

export type CaseSectionVisibility = Record<CaseSectionKey, boolean>;

/**
 * Decide qué secciones del caso enfatizar según estado y clave de etapa.
 * Las secciones ocultas se omiten del nav (siguen existiendo por URL directa).
 */
export function getCaseSectionVisibility(
  state: CaseState | string,
  stageKey?: string | null,
): CaseSectionVisibility {
  const key = (stageKey ?? "").toLowerCase();

  const base: CaseSectionVisibility = {
    summary: true,
    credito: true,
    rondas: true,
    documentos: true,
    tareas: true,
    cotizaciones: true,
    pagos: true,
    cartas: true,
  };

  if (state === "COMPLETED" || state === "CANCELLED") {
    return {
      ...base,
      rondas: false,
      documentos: true,
      tareas: false,
      cotizaciones: false,
      pagos: true,
      cartas: false,
      credito: true,
    };
  }

  // Intake / documentos tempranos
  if (
    /intake|onboard|document|welcome|lead|nuevo|kick/.test(key) ||
    key.includes("start")
  ) {
    return {
      ...base,
      rondas: false,
      cartas: false,
      credito: true,
      documentos: true,
      cotizaciones: true,
      pagos: false,
    };
  }

  // Disputa / rondas
  if (/dispute|round|ronda|letter|carta|bureau|bur[oó]/.test(key)) {
    return {
      ...base,
      rondas: true,
      cartas: true,
      credito: true,
      cotizaciones: false,
      pagos: false,
    };
  }

  // Cobro / cierre comercial
  if (/pay|payment|cobro|quote|cotiz|billing|invoice|close/.test(key)) {
    return {
      ...base,
      pagos: true,
      cotizaciones: true,
      rondas: false,
      cartas: false,
    };
  }

  return base;
}

/** Título de tarea sugerida al entrar a una etapa. */
export function suggestedTaskTitleForStage(stageName: string, stageKey?: string | null): string {
  const key = (stageKey ?? "").toLowerCase();
  if (/intake|document|onboard/.test(key)) {
    return `Recopilar documentos · ${stageName}`;
  }
  if (/dispute|round|ronda/.test(key)) {
    return `Preparar ronda · ${stageName}`;
  }
  if (/pay|payment|cobro|quote|cotiz/.test(key)) {
    return `Seguir cobro / cotización · ${stageName}`;
  }
  return `Siguiente paso · ${stageName}`;
}
