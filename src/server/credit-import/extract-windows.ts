/**
 * Ventanas, presupuesto y cobertura de extracción PDF.
 * Sin I/O de red: usable en smokes puros.
 */
import type { CreditPdfExtractionProposal } from "@/src/lib/validation/credit-import";
import type { PdfPageText } from "./pdf-text";
import {
  PIPELINE_VERSION,
  AI_TEXT_WINDOW,
  AI_TEXT_OVERLAP,
  AI_MAX_WINDOWS,
  AI_GENERAL_WINDOWS,
} from "./extract-constants";

export function planTextWindows(
  text: string,
  windowSize = AI_TEXT_WINDOW,
  overlap = AI_TEXT_OVERLAP,
): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= windowSize) return [t];

  const step = Math.max(1, windowSize - overlap);
  const windows: string[] = [];
  for (let start = 0; start < t.length; start += step) {
    windows.push(t.slice(start, start + windowSize));
    if (start + windowSize >= t.length) break;
  }

  const lastStart = Math.max(0, t.length - windowSize);
  const tail = t.slice(lastStart);
  if (
    windows[windows.length - 1] !== tail &&
    !windows.some((w) => w.endsWith(tail.slice(-200)))
  ) {
    windows.push(tail);
  }

  return windows;
}

/**
 * Parte el texto en ventanas solapadas (máx maxWindows).
 * Exportado para smokes puros.
 */
export function splitTextWindows(
  text: string,
  windowSize = AI_TEXT_WINDOW,
  overlap = AI_TEXT_OVERLAP,
  maxWindows = AI_MAX_WINDOWS,
): string[] {
  return planTextWindows(text, windowSize, overlap).slice(0, maxWindows);
}

export type PlannedWindow = {
  text: string;
  pages: number[];
};

/** Ventanas por página. Una página vacía no entra en el texto; queda contada aparte. */
export function planPageWindows(
  pages: readonly PdfPageText[],
  windowSize = AI_TEXT_WINDOW,
  overlap = AI_TEXT_OVERLAP,
): { windows: PlannedWindow[]; emptyPages: number[] } {
  const emptyPages = pages.filter((page) => page.empty || page.text.trim().length === 0).map((page) => page.page);
  const windows: PlannedWindow[] = [];
  let buf = "";
  let pageNums: number[] = [];

  const flush = () => {
    if (!buf.trim()) return;
    windows.push({ text: buf, pages: [...pageNums] });
    buf = "";
    pageNums = [];
  };

  for (const page of pages) {
    if (page.empty || page.text.trim().length === 0) continue;
    if (page.text.length > windowSize) {
      flush();
      for (const part of planTextWindows(page.text, windowSize, overlap)) {
        windows.push({ text: part, pages: [page.page] });
      }
      continue;
    }
    if (buf && buf.length + 2 + page.text.length > windowSize) {
      const tail = buf.slice(-overlap);
      flush();
      buf = tail ? `${tail}\n\n${page.text}` : page.text;
      pageNums = [page.page];
    } else {
      buf = buf ? `${buf}\n\n${page.text}` : page.text;
      pageNums.push(page.page);
    }
  }
  flush();
  return { windows, emptyPages };
}

/** Índice del primer ancla de scores en el texto (−1 si no hay). */
export function findScoreAnchorIndex(text: string): number {
  const lower = text.toLowerCase();
  const needles = [
    "credit score",
    "creditscore",
    "vantagescore",
    "vantage score",
    "fico",
    "your credit score",
  ];
  let best = -1;
  for (const n of needles) {
    const i = lower.indexOf(n);
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

/**
 * Ventanas generales + (si hay ancla) 1 ventana centrada en scores.
 * scoreWindowIndex apunta a la ventana dedicada, o null.
 */
export function buildExtractionWindows(text: string): {
  windows: string[];
  scoreWindowIndex: number | null;
  plannedWindows: number;
  omittedWindows: number;
} {
  const t = text.trim();
  if (!t) {
    return { windows: [], scoreWindowIndex: null, plannedWindows: 0, omittedWindows: 0 };
  }

  const all = planTextWindows(t);
  const anchor = findScoreAnchorIndex(t);
  if (anchor < 0) {
    const windows = all.slice(0, AI_MAX_WINDOWS);
    return {
      windows,
      scoreWindowIndex: null,
      plannedWindows: all.length,
      omittedWindows: all.length - windows.length,
    };
  }

  // Reservar 1 slot para pass score-focused (SCORE_EXTRACTION_SYSTEM / items []).
  // Nunca marcar una ventana general como score-focused: eso vacía las cuentas.
  const general = all.slice(0, AI_GENERAL_WINDOWS);

  // Preferir contexto previo al ancla (títulos + tabla de scores).
  const lead = Math.min(2_000, Math.floor(AI_TEXT_WINDOW * 0.25));
  const start = Math.max(
    0,
    Math.min(anchor - lead, Math.max(0, t.length - AI_TEXT_WINDOW)),
  );
  const scoreWin = t.slice(start, start + AI_TEXT_WINDOW);

  return {
    windows: [...general, scoreWin],
    scoreWindowIndex: general.length,
    plannedWindows: all.length + 1,
    omittedWindows: all.length - general.length,
  };
}

export function budgetPageWindows(input: {
  windows: readonly PlannedWindow[];
  scoreWindow: PlannedWindow | null;
  maxWindows?: number;
}): {
  windows: PlannedWindow[];
  scoreWindowIndex: number | null;
  plannedWindows: number;
  omittedWindows: number;
} {
  const maxWindows = input.maxWindows ?? AI_MAX_WINDOWS;
  const plannedWindows = input.windows.length + (input.scoreWindow ? 1 : 0);
  if (input.scoreWindow) {
    const general = input.windows.slice(0, Math.max(0, maxWindows - 1));
    return {
      windows: [...general, input.scoreWindow],
      scoreWindowIndex: general.length,
      plannedWindows,
      omittedWindows: input.windows.length - general.length,
    };
  }
  const windows = input.windows.slice(0, maxWindows);
  return {
    windows,
    scoreWindowIndex: null,
    plannedWindows,
    omittedWindows: input.windows.length - windows.length,
  };
}

export function windowNeedsRetry(finishReason: string | null | undefined): boolean {
  return finishReason === "length";
}

/**
 * Extrae ventanas con reanudación (seed) y pool de concurrencia.
 * `seed` rellena índices ya hechos (checkpoint); no se vuelven a llamar.
 */
export async function extractWindowsWithCheckpoint<T>(input: {
  windowCount: number;
  /** @deprecated Preferir `seed` (incluye valores). */
  completed?: ReadonlySet<number>;
  seed?: ReadonlyMap<number, T>;
  /** Default 1 (serie). PDF: 2 para free tier. */
  concurrency?: number;
  run: (index: number, attempt: 1 | 2) => Promise<{ finishReason: string | null; value: T }>;
}): Promise<{ values: T[]; retried: number[]; incomplete: number[]; called: number[] }> {
  const windowCount = Math.max(0, input.windowCount);
  const values: Array<T | undefined> = Array.from({ length: windowCount });
  const seed = input.seed ?? new Map<number, T>();
  const completed = new Set<number>(input.completed ?? []);
  for (const [index, value] of seed) {
    if (index < 0 || index >= windowCount) continue;
    values[index] = value;
    completed.add(index);
  }

  const pending: number[] = [];
  for (let index = 0; index < windowCount; index += 1) {
    if (values[index] !== undefined) continue;
    // `completed` sin seed: no re-llamar (smoke legacy); el valor no está en el array.
    if (completed.has(index)) continue;
    pending.push(index);
  }

  const retried: number[] = [];
  const incomplete: number[] = [];
  const called: number[] = [];
  const concurrency = Math.max(1, Math.min(input.concurrency ?? 1, pending.length || 1));

  async function runOne(index: number) {
    called.push(index);
    let result = await input.run(index, 1);
    if (windowNeedsRetry(result.finishReason)) {
      retried.push(index);
      called.push(index);
      result = await input.run(index, 2);
      if (windowNeedsRetry(result.finishReason)) incomplete.push(index);
    }
    values[index] = result.value;
  }

  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const index = pending[cursor]!;
      cursor += 1;
      await runOne(index);
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker()),
  );

  return {
    values: values as T[],
    retried,
    incomplete,
    called,
  };
}

export function assessExtractionCoverage(input: {
  plannedWindows: number;
  validWindows: number;
  plannedPages: number;
  emptyPages: number;
  omittedItems: number;
  incompleteWindows: number;
}): NonNullable<CreditPdfExtractionProposal["coverage"]> {
  const partial =
    input.emptyPages > 0 ||
    input.validWindows < input.plannedWindows ||
    input.omittedItems > 0 ||
    input.incompleteWindows > 0;
  return {
    pipelineVersion: PIPELINE_VERSION,
    status: partial ? "PARTIAL" : "COMPLETE",
    plannedWindows: input.plannedWindows,
    validWindows: input.validWindows,
    plannedPages: input.plannedPages,
    emptyPages: input.emptyPages,
    omittedItems: input.omittedItems,
    metricsBlocked: partial,
  };
}
