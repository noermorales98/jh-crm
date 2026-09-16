/**
 * AI-003 / AI-004 / AI-005 / AI-006 — tareas de IA sobre datos ya sanitizados.
 * Nunca aplican cambios; solo proponen texto / sugerencias / hits de búsqueda.
 */
import { generateText } from "ai";
import {
  createOpenRouterModel,
  isOpenRouterConfigured,
} from "@/src/lib/ai/openrouter";
import { sanitizeForAI } from "@/src/lib/ai/sanitize";
import type { SpotlightHit, SpotlightKind } from "@/src/lib/search/spotlight";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { DomainError } from "@/src/server/errors";
import {
  CRM_LIST_ENTITIES,
  getCaseBrief,
  getCreditCaseDetail,
  getRoutesAndHowTo,
  listCrm,
  searchCrm,
  type CrmListEntity,
} from "@/src/server/ai/queries";

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

export type AssistSearchMode = "find" | "list" | "howto";

export type AssistSearchIntent = {
  mode: AssistSearchMode;
  entity: CrmListEntity | null;
  q: string | null;
  status: string | null;
  topic: string | null;
};

const ENTITY_ALIASES: Record<string, CrmListEntity> = {
  clients: "clients",
  client: "clients",
  cliente: "clients",
  clientes: "clients",
  cases: "cases",
  case: "cases",
  caso: "cases",
  casos: "cases",
  payments: "payments",
  payment: "payments",
  pago: "payments",
  pagos: "payments",
  tasks: "tasks",
  task: "tasks",
  tarea: "tasks",
  tareas: "tasks",
  quotes: "quotes",
  quote: "quotes",
  cotizacion: "quotes",
  cotización: "quotes",
  cotizaciones: "quotes",
  rounds: "rounds",
  round: "rounds",
  ronda: "rounds",
  rondas: "rounds",
  receipts: "receipts",
  receipt: "receipts",
  recibo: "receipts",
  recibos: "receipts",
};

const ENTITY_LABEL: Record<CrmListEntity, string> = {
  clients: "clientes",
  cases: "casos",
  payments: "pagos",
  tasks: "tareas",
  quotes: "cotizaciones",
  rounds: "rondas",
  receipts: "recibos",
};

const ENTITY_KIND: Record<CrmListEntity, SpotlightKind> = {
  clients: "client",
  cases: "case",
  payments: "payment",
  tasks: "task",
  quotes: "quote",
  rounds: "round",
  receipts: "receipt",
};

function resolveEntity(raw: unknown): CrmListEntity | null {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if ((CRM_LIST_ENTITIES as readonly string[]).includes(key)) {
    return key as CrmListEntity;
  }
  return ENTITY_ALIASES[key] ?? null;
}

function parseAssistIntent(
  parsed: Record<string, unknown> | null,
  fallbackQ: string,
): AssistSearchIntent {
  const modeRaw = typeof parsed?.mode === "string" ? parsed.mode : "find";
  const mode: AssistSearchMode =
    modeRaw === "list" || modeRaw === "howto" || modeRaw === "find"
      ? modeRaw
      : "find";
  const q =
    typeof parsed?.q === "string" && parsed.q.trim()
      ? parsed.q.trim()
      : mode === "find"
        ? fallbackQ
        : null;
  return {
    mode,
    entity: resolveEntity(parsed?.entity),
    q,
    status:
      typeof parsed?.status === "string" && parsed.status.trim()
        ? parsed.status.trim()
        : null,
    topic:
      typeof parsed?.topic === "string" && parsed.topic.trim()
        ? parsed.topic.trim()
        : null,
  };
}

function hitsFromSearchCrm(result: unknown, scoreBase = 70): SpotlightHit[] {
  if (!result || typeof result !== "object" || "error" in result) return [];
  const crm = result as Record<string, unknown>;
  const hits: SpotlightHit[] = [];

  for (const row of (crm.clients as Array<Record<string, unknown>> | undefined) ?? []) {
    hits.push({
      id: `client-${String(row.id)}`,
      kind: "client",
      title: String(row.name ?? ""),
      subtitle: [row.clientCode, row.statusLabel, row.email]
        .filter(Boolean)
        .map(String)
        .join(" · "),
      href: typeof row.href === "string" ? row.href : undefined,
      score: scoreBase,
    });
  }
  for (const row of (crm.cases as Array<Record<string, unknown>> | undefined) ?? []) {
    hits.push({
      id: `case-${String(row.id)}`,
      kind: "case",
      title: String(row.caseCode ?? ""),
      subtitle: [row.client, row.stage, row.statusLabel]
        .filter(Boolean)
        .map(String)
        .join(" · "),
      href: typeof row.href === "string" ? row.href : undefined,
      score: scoreBase,
    });
  }
  for (const row of (crm.quotes as Array<Record<string, unknown>> | undefined) ?? []) {
    hits.push({
      id: `quote-${String(row.id)}`,
      kind: "quote",
      title: String(row.folio ?? ""),
      subtitle: [row.client, row.statusLabel, row.total]
        .filter(Boolean)
        .map(String)
        .join(" · "),
      href: typeof row.href === "string" ? row.href : undefined,
      score: scoreBase - 2,
    });
  }
  for (const row of (crm.payments as Array<Record<string, unknown>> | undefined) ?? []) {
    hits.push({
      id: `payment-${String(row.id)}`,
      kind: "payment",
      title: String(row.amount ?? "Pago"),
      subtitle: [row.client, row.statusLabel].filter(Boolean).map(String).join(" · "),
      href: typeof row.href === "string" ? row.href : undefined,
      score: scoreBase - 4,
    });
  }
  for (const row of (crm.tasks as Array<Record<string, unknown>> | undefined) ?? []) {
    hits.push({
      id: `task-${String(row.id)}`,
      kind: "task",
      title: String(row.title ?? ""),
      subtitle: [row.client, row.statusLabel].filter(Boolean).map(String).join(" · "),
      href: typeof row.href === "string" ? row.href : undefined,
      score: scoreBase - 4,
    });
  }
  for (const row of (crm.rounds as Array<Record<string, unknown>> | undefined) ?? []) {
    hits.push({
      id: `round-${String(row.id)}`,
      kind: "round",
      title: `Ronda ${String(row.roundNumber ?? "")}`,
      subtitle: [row.caseCode, row.client, row.statusLabel]
        .filter(Boolean)
        .map(String)
        .join(" · "),
      href: typeof row.href === "string" ? row.href : undefined,
      score: scoreBase - 2,
    });
  }
  for (const row of (crm.receipts as Array<Record<string, unknown>> | undefined) ?? []) {
    hits.push({
      id: `receipt-${String(row.id)}`,
      kind: "receipt",
      title: String(row.folio ?? ""),
      subtitle: [row.client, row.statusLabel, row.amount]
        .filter(Boolean)
        .map(String)
        .join(" · "),
      href: typeof row.href === "string" ? row.href : undefined,
      score: scoreBase - 4,
    });
  }
  return hits.slice(0, 18);
}

function hitsFromListCrm(result: unknown, entity: CrmListEntity): SpotlightHit[] {
  if (!result || typeof result !== "object" || "error" in result) return [];
  const listed = result as {
    listHref?: string;
    total?: number;
    items?: Array<Record<string, unknown>>;
  };
  const kind = ENTITY_KIND[entity];
  const hits: SpotlightHit[] = [];
  if (typeof listed.listHref === "string") {
    hits.push({
      id: `list-${entity}`,
      kind: "page",
      title: `Ver todos los ${ENTITY_LABEL[entity]}`,
      subtitle:
        typeof listed.total === "number"
          ? `${listed.total} en total`
          : "Abrir listado",
      href: listed.listHref,
      score: 95,
    });
  }
  for (const row of listed.items ?? []) {
    const id = typeof row.id === "string" ? row.id : null;
    const title =
      (typeof row.name === "string" && row.name) ||
      (typeof row.caseCode === "string" && row.caseCode) ||
      (typeof row.title === "string" && row.title) ||
      (typeof row.folio === "string" && row.folio) ||
      (typeof row.amount === "string" && row.amount) ||
      (typeof row.roundNumber === "number" && `Ronda ${row.roundNumber}`) ||
      "Registro";
    const subtitle = [
      row.client,
      row.statusLabel,
      row.stage,
      typeof row.roundNumber === "number" ? `Ronda ${row.roundNumber}` : null,
    ]
      .filter(Boolean)
      .map(String)
      .join(" · ");
    hits.push({
      id: id ? `${kind}-${id}` : `${kind}-${title}-${hits.length}`,
      kind,
      title: String(title),
      subtitle,
      href: typeof row.href === "string" ? row.href : listed.listHref,
      score: 68,
    });
  }
  return hits.slice(0, 16);
}

function hitsFromHowTo(topic?: string | null): SpotlightHit[] {
  const howto = getRoutesAndHowTo(topic ?? undefined);
  return howto.routes
    .filter((route) => route.clickable)
    .slice(0, 10)
    .map((route, index) => ({
      id: `howto-${route.href}-${index}`,
      kind: "page" as const,
      title: route.label,
      subtitle: route.how.slice(0, 120),
      href: route.href,
      score: 80 - index,
    }));
}

/** AI-006: clasifica intent NL y ejecuta searchCrm / listCrm / getHowTo (sin inventar filas). */
export async function assistSearch(
  ctx: OrganizationContext,
  rawQuery: string,
) {
  requireAi();
  const query = rawQuery.trim();
  if (query.length < 2 || query.length > 200) {
    throw new DomainError(
      "La búsqueda asistida necesita entre 2 y 200 caracteres.",
    );
  }

  const { text } = await generateText({
    model: createOpenRouterModel(),
    system:
      'Clasifica una búsqueda del CRM. Responde SOLO JSON: {"mode":"find"|"list"|"howto","entity":"clients"|"cases"|"payments"|"tasks"|"quotes"|"rounds"|"receipts"|null,"q":"texto a buscar o null","status":"filtro estado o null","topic":"tema howto o null"}. find=buscar persona/folio; list=inventario (lista de clientes/pagos…); howto=cómo hacer algo en el CRM. No inventes IDs ni registros.',
    prompt: `Consulta del staff:\n${sanitizeForAI(query)}`,
    maxRetries: 1,
  });
  const intent = parseAssistIntent(parseJsonObject(text), query);

  let hits: SpotlightHit[] = [];
  let summary: string;

  if (intent.mode === "howto") {
    hits = hitsFromHowTo(intent.topic ?? intent.q ?? query);
    summary = hits.length
      ? `Guía: ${hits.length} rutas relacionadas.`
      : "No encontré rutas para esa guía.";
  } else if (intent.mode === "list") {
    const entity = intent.entity ?? "clients";
    const listed = await listCrm(ctx, entity, {
      status: intent.status ?? undefined,
      q: intent.q ?? undefined,
    });
    if (listed && typeof listed === "object" && "error" in listed) {
      summary = String((listed as { error: string }).error);
      hits = [];
    } else {
      hits = hitsFromListCrm(listed, entity);
      const total =
        listed && typeof listed === "object" && "total" in listed
          ? Number((listed as { total: number }).total)
          : hits.length;
      summary = `Listado de ${ENTITY_LABEL[entity]}${
        intent.status ? ` (${intent.status})` : ""
      }: ${total} registro(s).`;
    }
  } else {
    const searchQ = (intent.q ?? query).trim();
    const crm = await searchCrm(ctx, searchQ);
    if (crm && typeof crm === "object" && "error" in crm) {
      summary = String((crm as { error: string }).error);
      hits = [];
    } else {
      hits = hitsFromSearchCrm(crm);
      summary = hits.length
        ? `Encontré ${hits.length} resultado(s) para «${searchQ}».`
        : `Sin coincidencias para «${searchQ}».`;
    }
  }

  return {
    label: "Búsqueda asistida (datos reales del CRM)",
    intent,
    hits,
    summary,
  };
}
