const SEED_KEY = "jh-ai-seed";
const consumed = new Set<string>();

type Seed = { chatId: string; prompt: string };

function readSeed(): Seed | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SEED_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      typeof (parsed as Seed).chatId !== "string" ||
      typeof (parsed as Seed).prompt !== "string"
    ) {
      return null;
    }
    const prompt = (parsed as Seed).prompt.trim();
    if (!prompt) return null;
    return { chatId: (parsed as Seed).chatId, prompt };
  } catch {
    return null;
  }
}

/** Guarda la pregunta y devuelve la ruta de un chat nuevo. */
export function startAskAiChat(prompt: string): string | null {
  const text = prompt.trim();
  if (!text || typeof window === "undefined") return null;
  const chatId = crypto.randomUUID();
  consumed.delete(chatId);
  sessionStorage.setItem(SEED_KEY, JSON.stringify({ chatId, prompt: text }));
  return `/crm/chats/${chatId}`;
}

/** Una sola vez por chat (sobrevive al Strict Mode). */
export function takeAskAiSeed(chatId: string): string | null {
  if (consumed.has(chatId)) return null;
  const seed = readSeed();
  if (!seed || seed.chatId !== chatId) return null;
  consumed.add(chatId);
  try {
    sessionStorage.removeItem(SEED_KEY);
  } catch {
    // privado / cuota
  }
  return seed.prompt;
}
