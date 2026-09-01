import { createOpenRouter } from "@openrouter/ai-sdk-provider";

const FREE_MODEL = process.env.OPENROUTER_MODEL?.trim() || "openrouter/free";

function apiKeys(): string[] {
  return [
    process.env.OPENROUTER_API_KEY,
    process.env.OPENROUTER_API_KEY_SECONDARY,
  ].filter((key): key is string => Boolean(key && key.trim() && key.trim() !== "s"));
}

export function isOpenRouterConfigured(): boolean {
  return apiKeys().length > 0;
}

/**
 * Cliente OpenRouter con rotación de API key si la primaria responde 429/402.
 * El modelo por defecto es el router gratuito (`openrouter/free`), que elige
 * un modelo :free con las capacidades que pide la llamada (p. ej. tools).
 */
export function createOpenRouterModel() {
  const keys = apiKeys();
  if (keys.length === 0) {
    throw new Error("Falta OPENROUTER_API_KEY.");
  }

  const openrouter = createOpenRouter({
    apiKey: keys[0],
    appName: "J&H CRM",
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://jh-multiservices.com",
    extraBody: {
      models: [FREE_MODEL],
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

  return openrouter(FREE_MODEL);
}
