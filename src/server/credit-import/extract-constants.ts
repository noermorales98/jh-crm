/**
 * Constantes del pipeline de extracción PDF.
 */
export const PIPELINE_VERSION = "t07-2026-10-20";

/** Mínimo de caracteres útiles para llamar al modelo (alineado con pdf-text). */
export const MIN_USEFUL_CHARS = 800;

/** Tamaño de cada ventana enviada al modelo (chars). */
export const AI_TEXT_WINDOW = 14_000;
/** Solape entre ventanas consecutivas. */
export const AI_TEXT_OVERLAP = 1_500;
/** Máximo de llamadas OpenRouter por PDF (incluye 1 ventana de scores). */
export const AI_MAX_WINDOWS = 5;
/** Ventanas generales; se reserva 1 slot para scores cuando hay ancla. */
export const AI_GENERAL_WINDOWS = AI_MAX_WINDOWS - 1;
