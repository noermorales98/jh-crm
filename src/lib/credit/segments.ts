/** Calificación de clientes por su último reporte (estilo Fondify). */
export type CreditSegment = "listo" | "estructuracion" | "reparacion" | "sin_datos";

export const CREDIT_SEGMENTS: {
  id: CreditSegment;
  label: string;
  hint: string;
  tone: "success" | "accent" | "danger" | "neutral";
}[] = [
  {
    id: "listo",
    label: "Listos para fondeo",
    hint: "Cumplen la matriz en los 3 burós",
    tone: "success",
  },
  {
    id: "estructuracion",
    label: "Estructuración",
    hint: "Sin negativos; falta score, utilización o estructura",
    tone: "accent",
  },
  {
    id: "reparacion",
    label: "Reparación",
    hint: "Tienen negativos en el último reporte",
    tone: "danger",
  },
  {
    id: "sin_datos",
    label: "Sin datos",
    hint: "Súbeles un reporte",
    tone: "neutral",
  },
];

export const CREDIT_SEGMENT_SHORT: Record<CreditSegment, string> = {
  listo: "Listo para fondeo",
  estructuracion: "Estructuración",
  reparacion: "Reparación",
  sin_datos: "Sin reporte",
};
