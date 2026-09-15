import { generateText } from "ai";
import {
  createOpenRouterModel,
  isOpenRouterConfigured,
} from "@/src/lib/ai/openrouter";
import { sanitizeTextForAI } from "@/src/lib/ai/sanitize";

const MAX_BODY_CHARS = 8_000;
const MYMEMORY_CHUNK = 420;

export type TranslatedMail = {
  subject: string;
  body: string;
};

function clip(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max).trim()}…`;
}

function parseModelJson(text: string): TranslatedMail | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as {
      subject?: unknown;
      body?: unknown;
    };
    if (typeof parsed.body !== "string" || !parsed.body.trim()) return null;
    return {
      subject:
        typeof parsed.subject === "string" && parsed.subject.trim()
          ? parsed.subject.trim()
          : "",
      body: parsed.body.trim(),
    };
  } catch {
    return null;
  }
}

async function translateWithAi(
  subject: string,
  body: string,
): Promise<TranslatedMail> {
  const { text } = await generateText({
    model: createOpenRouterModel(),
    system:
      "Eres un traductor profesional. Traduce del inglés al español (México/Latam, formal y claro). Conserva nombres propios, correos, URLs y cifras. Responde SOLO un JSON: {\"subject\":\"...\",\"body\":\"...\"}.",
    prompt: `Asunto:\n${subject}\n\nCuerpo:\n${body}`,
    maxRetries: 1,
  });
  const parsed = parseModelJson(text);
  if (parsed) {
    return {
      subject: parsed.subject || subject,
      body: parsed.body,
    };
  }
  return { subject, body: text.trim() || body };
}

async function translateChunk(text: string): Promise<string> {
  const url = new URL("https://api.mymemory.translated.net/get");
  url.searchParams.set("q", text);
  url.searchParams.set("langpair", "en|es");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`MyMemory ${response.status}`);
  }
  const json = (await response.json()) as {
    responseData?: { translatedText?: string };
  };
  const translated = json.responseData?.translatedText?.trim();
  return translated || text;
}

function splitChunks(text: string): string[] {
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= MYMEMORY_CHUNK) {
      chunks.push(rest);
      break;
    }
    let cut = rest.lastIndexOf(" ", MYMEMORY_CHUNK);
    if (cut < 80) cut = MYMEMORY_CHUNK;
    chunks.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  return chunks.filter(Boolean);
}

async function translateWithMyMemory(
  subject: string,
  body: string,
): Promise<TranslatedMail> {
  const subjectEs = subject.trim()
    ? await translateChunk(clip(subject, MYMEMORY_CHUNK))
    : subject;
  const parts: string[] = [];
  for (const chunk of splitChunks(body)) {
    parts.push(await translateChunk(chunk));
  }
  return {
    subject: subjectEs,
    body: parts.join("\n").trim() || body,
  };
}

/**
 * Traduce asunto + cuerpo EN→ES. Prefiere OpenRouter; si no hay clave o
 * falla, usa MyMemory (límite por fragmento).
 */
export async function translateEnglishToSpanish(input: {
  subject: string;
  body: string;
}): Promise<TranslatedMail> {
  // AI-002: enmascarar SSN/ITIN antes de enviar a servicios externos
  // (OpenRouter y el fallback MyMemory son terceros).
  const subject = sanitizeTextForAI(input.subject.trim() || "(Sin asunto)");
  const body = clip(
    sanitizeTextForAI(input.body.replace(/\s+\n/g, "\n").trim() || "(Sin contenido)"),
    MAX_BODY_CHARS,
  );

  if (isOpenRouterConfigured()) {
    try {
      return await translateWithAi(subject, body);
    } catch (error) {
      console.error(
        "[mail-translate] IA no disponible, se usa MyMemory:",
        error instanceof Error ? error.message : "error",
      );
    }
  }

  return translateWithMyMemory(subject, body);
}
