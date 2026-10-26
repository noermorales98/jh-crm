/**
 * Constantes del pipeline de extracción PDF.
 */
export const PIPELINE_VERSION = "t07-2026-10-20";

/** Mínimo de caracteres útiles para llamar al modelo (alineado con pdf-text). */
export const MIN_USEFUL_CHARS = 800;

/**
 * Tamaño de cada ventana (chars). 28k ≈ el trozo único de CR-PDF-001;
 * ventanas más grandes → menos llamadas OpenRouter (antes 14k×5 era muy lento).
 */
export const AI_TEXT_WINDOW = 28_000;
/** Solape entre ventanas consecutivas. */
export const AI_TEXT_OVERLAP = 2_000;
/**
 * Máximo de llamadas OpenRouter por PDF (incluye 1 ventana de scores si hace falta).
 * Con concurrencia 2: ≤2 rondas de latencia free (antes hasta 5 en serie).
 */
export const AI_MAX_WINDOWS = 3;
/** Ventanas generales; se reserva 1 slot para scores cuando hay ancla. */
export const AI_GENERAL_WINDOWS = AI_MAX_WINDOWS - 1;
