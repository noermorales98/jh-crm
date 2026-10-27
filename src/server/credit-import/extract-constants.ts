/**
 * Constantes del pipeline de extracción PDF.
 */
export const PIPELINE_VERSION = "t07-2026-10-20";

/** Mínimo de caracteres útiles para llamar al modelo (alineado con pdf-text). */
export const MIN_USEFUL_CHARS = 800;

/**
 * Tamaño de cada ventana (chars). El límite real es la SALIDA: los modelos free
 * escriben ~50 tok/s y cada ventana debe acabar holgada dentro de los 300s de
 * Vercel Hobby. 48k chars / 40 cuentas × 3 burós tardó 354s; 20k ≈ 1/2–1/3.
 */
export const AI_TEXT_WINDOW = 20_000;
/** Solape entre ventanas consecutivas. */
export const AI_TEXT_OVERLAP = 2_000;
/**
 * Máximo de llamadas OpenRouter por PDF (incluye 1 ventana de scores si hace falta).
 * 16 × 20k ≈ 300k chars: cubre reportes completos de ~80 págs sin omitir ventanas.
 * Con checkpoints por ventana, un timeout reanuda donde quedó.
 */
export const AI_MAX_WINDOWS = 16;
/** Ventanas generales; se reserva 1 slot para scores cuando hay ancla. */
export const AI_GENERAL_WINDOWS = AI_MAX_WINDOWS - 1;
