import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { DomainError } from "@/src/server/errors";

/** Router free genérico (chat / fallback). */
export const OPENROUTER_FREE_ROUTER = "openrouter/free";

/**
 * Default PDF: free “lightning” (más rápido que Gemma 26B/31B).
 * Override: CREDIT_PDF_OPENROUTER_MODEL (debe ser :free).
 * Nota: minimax flash :free ya no está en el catálogo gratis actual.
 */
export const CREDIT_PDF_DEFAULT_FREE_MODEL =
  "nvidia/nemotron-3.5-lightning:free";

const CREDIT_PDF_FREE_FALLBACKS = [
  CREDIT_PDF_DEFAULT_FREE_MODEL,
  "poolside/laguna-xs-2.1:free",
  "google/gemma-4-26b-a4b-it:free",
  OPENROUTER_FREE_ROUTER,
] as const;

export type OpenRouterPurpose = "default" | "credit-pdf";

function apiKeys(): string[] {
  return [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_SECONDARY,
  ].filter((key): key is string => Boolean(key && key.trim() && key.trim() !== "s"));
}

export function isOpenRouterConfigured(): boolean {
  return apiKeys().length > 0;
}

/** Solo IDs gratuitos de OpenRouter. */
export function isFreeOpenRouterModel(modelId: string): boolean {
  const id = modelId.trim();
  if (!id) return false;
  if (id === OPENROUTER_FREE_ROUTER) return true;
  return id.endsWith(":free");
}

export function assertFreeOpenRouterModel(modelId: string): string {
  const id = modelId.trim();
  if (!isFreeOpenRouterModel(id)) {
    throw new DomainError(
      `Solo se permiten modelos gratuitos de OpenRouter (sufijo :free o ${OPENROUTER_FREE_ROUTER}). Recibido: ${id}`,
    );
  }
  return id;
}

export function resolveOpenRouterModelId(
  purpose: OpenRouterPurpose = "default",
): string {
  if (purpose === "credit-pdf") {
    const fromEnv =
      process.env.CREDIT_PDF_OPENROUTER_MODEL?.trim() ||
      process.env.OPENROUTER_MODEL?.trim() ||
      CREDIT_PDF_DEFAULT_FREE_MODEL;
    return assertFreeOpenRouterModel(fromEnv);
  }
  const fromEnv =
    process.env.OPENROUTER_MODEL?.trim() || OPENROUTER_FREE_ROUTER;
  return assertFreeOpenRouterModel(fromEnv);
}

function fallbackModels(primary: string, purpose: OpenRouterPurpose): string[] {
  if (purpose === "credit-pdf") {
    const list = [primary, ...CREDIT_PDF_FREE_FALLBACKS].filter(
      (id, index, arr) => isFreeOpenRouterModel(id) && arr.indexOf(id) === index,
    );
    return list;
  }
  return [primary];
}

/**
 * Cliente OpenRouter con rotación de API key si la primaria responde 429/402.
 * `purpose: "credit-pdf"` usa CREDIT_PDF_OPENROUTER_MODEL (solo :free).
 * Chat / default: OPENROUTER_MODEL o openrouter/free.
 */
export function createOpenRouterModel(
  options?: { purpose?: OpenRouterPurpose },
) {
  const purpose = options?.purpose ?? "default";
  const keys = apiKeys();
  if (keys.length === 0) {
    throw new Error("Falta OPENROUTER_API_KEY.");
  }

  const modelId = resolveOpenRouterModelId(purpose);
  const models = fallbackModels(modelId, purpose);

  const openrouter = createOpenRouter({
    apiKey: keys[0],
    appName: "J&H CRM",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://jh-multiservices.com",
    extraBody: {
      models,
      provider: { allow_fallbacks: true, require_parameters: true },
    },
    fetch: async (url, init) => {
      const first = await fetch(url, init);
      if (
        keys.length > 1 &&
        (first.status === 429 || first.status === 402 || first.status === 401)
      ) {
        const headers = new Headers(init?.headers);
        headers.set("Authorization", `Bearer ${keys[1]}`);
        return fetch(url, { ...init, headers });
      }
      return first;
    },
  });

  return openrouter(modelId);
}
