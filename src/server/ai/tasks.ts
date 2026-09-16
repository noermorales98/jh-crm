/**
 * AI-003 / AI-004 / AI-005 — tareas de IA sobre datos ya sanitizados.
 * Nunca aplican cambios; solo proponen texto / sugerencias.
 */
import { generateText } from "ai";
import {
  createOpenRouterModel,
  isOpenRouterConfigured,
} from "@/src/lib/ai/openrouter";
import { sanitizeForAI } from "@/src/lib/ai/sanitize";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import { getCaseBrief, getCreditCaseDetail } from "@/src/server/ai/queries";

function requireAi() {
  if (!isOpenRouterConfigured()) {
    throw new DomainError(
      "OpenRouter no está configurado (falta OPENROUTER_API_KEY).",
    );
  }
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function summarizeCase(ctx: OrganizationContext, caseId: string) {
  requireAi();
  const [brief, credit] = await Promise.all([
    getCaseBrief(ctx, caseId),
    getCreditCaseDetail(ctx, caseId),
  ]);
  if (brief && typeof brief === "object" && "error" in brief) {
    return brief;
  }
  const payload = sanitizeForAI({ brief, credit });
  const { text } = await generateText({
    model: createOpenRouterModel(),
    system:
      "Eres analista del CRM de reparación de crédito. Resume SOLO con los datos del JSON. No inventes scores, eliminaciones ni fechas. Responde en español, 1 párrafo + 3-6 viñetas de hechos. Si falta dato, dilo.",
    prompt: `Resume este expediente:\n${JSON.stringify(payload).slice(0, 12000)}`,
    maxRetries: 1,
  });
  return { caseId, summary: text.trim(), label: "Resumen de IA (no inventa datos)" };
}

export async function suggestNextAction(
  ctx: OrganizationContext,
  caseId: string,
) {
  requireAi();
  const brief = await getCaseBrief(ctx, caseId);
  if (brief && typeof brief === "object" && "error" in brief) {
    return brief;
  }
  const payload = sanitizeForAI(brief);
  const { text } = await generateText({
    model: createOpenRouterModel(),
    system:
      'Eres coach operativo del CRM. Sugiere UNA siguiente acción humana. Responde SOLO JSON: {"suggestion":"...","rationale":"...","urgency":"low|normal|high"}. Es sugerencia, NUNCA una orden automática. No inventes datos.',
    prompt: `Datos del expediente:\n${JSON.stringify(payload).slice(0, 10000)}`,
    maxRetries: 1,
  });
  const parsed = parseJsonObject(text);
  return {
    caseId,
    label: "Sugerencia de IA (no se aplica sola)",
    suggestion:
      typeof parsed?.suggestion === "string"
        ? parsed.suggestion
        : text.trim(),
    rationale:
      typeof parsed?.rationale === "string" ? parsed.rationale : null,
    urgency:
      parsed?.urgency === "low" ||
      parsed?.urgency === "normal" ||
      parsed?.urgency === "high"
        ? parsed.urgency
        : "normal",
  };
}

export async function extractNoteActions(
  ctx: OrganizationContext,
  noteText: string,
  caseId?: string | null,
) {
  requireAi();
  const note = noteText.trim();
  if (!note || note.length > 8000) {
    throw new DomainError("La nota debe tener entre 1 y 8000 caracteres.");
  }
  let caseContext: unknown = null;
  let clientId: string | null = null;
  if (caseId) {
    const brief = await getCaseBrief(ctx, caseId);
    caseContext = sanitizeForAI(brief);
    const maybeClientId = (
      brief as { case?: { client?: { id?: string } } } | null
    )?.case?.client?.id;
    if (typeof maybeClientId === "string") clientId = maybeClientId;
  }
  const { text } = await generateText({
    model: createOpenRouterModel(),
    system:
      'Extrae acciones propuestas desde una nota del staff. Responde SOLO JSON: {"proposals":[{"kind":"task"|"activity"|"status_note","title":"...","details":"..."}]}. Máximo 5. No apliques cambios; solo propuestas para que el humano confirme en la UI. No inventes IDs.',
    prompt: `Nota:\n${sanitizeForAI(note)}\n\nContexto caso (opcional):\n${JSON.stringify(caseContext ?? {}).slice(0, 4000)}`,
    maxRetries: 1,
  });
  const parsed = parseJsonObject(text);
  const proposals = Array.isArray(parsed?.proposals) ? parsed.proposals : [];
  return {
    caseId: caseId ?? null,
    clientId,
    label: "Propuestas de IA — confirmar antes de aplicar",
    proposals,
    raw: proposals.length ? undefined : text.trim(),
  };
}
