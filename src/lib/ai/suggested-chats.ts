/**
 * Sugerencias de chat para el dashboard: priorizan datos reales del día
 * y rotan ideas generales para que el listado cambie con el tiempo.
 */

export type SuggestedChat = {
  /** Semilla del blobatar (distinta por sugerencia). */
  id: string;
  title: string;
  subtitle: string;
  prompt: string;
};

type SuggestionInput = {
  overdueTasks: number;
  tasksToday: number;
  pendingPayments: number;
  overduePayments: number;
  openCases: number;
  documentsPending: number;
  unreadMails: number;
  overdueUpdates: number;
  newLeads: number;
  activeRounds: number;
};

const EVERGREEN: readonly SuggestedChat[] = [
  {
    id: "suggest:overview",
    title: "¿Por dónde empiezo hoy?",
    subtitle: "Prioridades del día",
    prompt:
      "Resume qué debería hacer primero hoy en el CRM según lo pendiente (tareas, cobros y casos).",
  },
  {
    id: "suggest:client-followup",
    title: "Seguimiento a un cliente",
    subtitle: "Qué decir y cuándo",
    prompt:
      "Ayúdame a preparar un seguimiento claro para un cliente activo: qué revisar y qué preguntarle.",
  },
  {
    id: "suggest:explain-case",
    title: "Explicar un caso en simple",
    subtitle: "Lenguaje cotidiano",
    prompt:
      "Explícame en lenguaje sencillo cómo va un caso de reparación de crédito típico y qué debe ver el cliente.",
  },
  {
    id: "suggest:collect",
    title: "Cobrar con tacto",
    subtitle: "Mensaje de cobro",
    prompt:
      "Redacta un mensaje amable para recordar un pago pendiente a un cliente, corto y profesional.",
  },
  {
    id: "suggest:docs",
    title: "Documentos que faltan",
    subtitle: "Checklist para el cliente",
    prompt:
      "Dame una lista clara de documentos que suele faltar al abrir un caso y cómo pedirlos al cliente.",
  },
  {
    id: "suggest:round",
    title: "Estado de una ronda",
    subtitle: "Qué revisar ahora",
    prompt:
      "Guíame paso a paso para revisar el estado de una ronda de disputa y qué hacer después.",
  },
  {
    id: "suggest:inbox",
    title: "Responder un correo",
    subtitle: "Borrador útil",
    prompt:
      "Ayúdame a redactar una respuesta breve y clara a un correo de un cliente del CRM.",
  },
  {
    id: "suggest:week-plan",
    title: "Plan de la semana",
    subtitle: "Organizar el trabajo",
    prompt:
      "Propón un plan simple para esta semana en el CRM: cobros, tareas y casos, en orden de prioridad.",
  },
];

function daySeed(now = new Date()): number {
  // Cambia cada día (y un poco por hora) para rotar sugerencias evergreen.
  return (
    now.getFullYear() * 10000 +
    (now.getMonth() + 1) * 100 +
    now.getDate() +
    Math.floor(now.getHours() / 6)
  );
}

function rotate<T>(items: readonly T[], offset: number): T[] {
  if (items.length === 0) return [];
  const start = ((offset % items.length) + items.length) % items.length;
  return [...items.slice(start), ...items.slice(0, start)];
}

/** Construye hasta `limit` sugerencias dinámicas según el estado del CRM. */
export function buildSuggestedChats(
  input: SuggestionInput,
  limit = 4,
  now = new Date(),
): SuggestedChat[] {
  const contextual: SuggestedChat[] = [];

  if (input.overdueTasks > 0) {
    contextual.push({
      id: "suggest:overdue-tasks",
      title: `${input.overdueTasks} tarea${input.overdueTasks === 1 ? "" : "s"} vencida${input.overdueTasks === 1 ? "" : "s"}`,
      subtitle: "Ayuda a priorizarlas",
      prompt: `Tengo ${input.overdueTasks} tarea(s) vencida(s). Ayúdame a priorizarlas y dime qué hacer primero.`,
    });
  }

  if (input.overduePayments > 0 || input.pendingPayments > 0) {
    const n = input.overduePayments || input.pendingPayments;
    contextual.push({
      id: "suggest:pending-pay",
      title:
        input.overduePayments > 0
          ? `${n} pago${n === 1 ? "" : "s"} vencido${n === 1 ? "" : "s"}`
          : `${n} por cobrar`,
      subtitle: "Ideas para cobrar hoy",
      prompt: `Hay ${n} pago(s) por cobrar${input.overduePayments > 0 ? " (algunos vencidos)" : ""}. Sugiere un plan simple para cobrar hoy y un mensaje modelo.`,
    });
  }

  if (input.documentsPending > 0) {
    contextual.push({
      id: "suggest:docs-pending",
      title: `${input.documentsPending} caso${input.documentsPending === 1 ? "" : "s"} sin docs`,
      subtitle: "Cómo pedirlos",
      prompt: `Hay ${input.documentsPending} caso(s) con documentos pendientes. Ayúdame a pedir lo que falta de forma clara al cliente.`,
    });
  }

  if (input.overdueUpdates > 0) {
    contextual.push({
      id: "suggest:reviews",
      title: `${input.overdueUpdates} revisión${input.overdueUpdates === 1 ? "" : "es"} vencida${input.overdueUpdates === 1 ? "" : "s"}`,
      subtitle: "Qué revisar ya",
      prompt: `Tengo ${input.overdueUpdates} revisión(es) de caso vencida(s). Dime qué revisar en cada una y el siguiente paso.`,
    });
  }

  if (input.tasksToday > 0) {
    contextual.push({
      id: "suggest:today-tasks",
      title: `${input.tasksToday} para hoy`,
      subtitle: "Ordenar la jornada",
      prompt: `Tengo ${input.tasksToday} tarea(s) para hoy. Organízamelas en un orden práctico para no perder tiempo.`,
    });
  }

  if (input.unreadMails > 0) {
    contextual.push({
      id: "suggest:unread-mail",
      title: `${input.unreadMails} mensaje${input.unreadMails === 1 ? "" : "s"} sin leer`,
      subtitle: "Cómo responder",
      prompt: `Hay ${input.unreadMails} correo(s) sin leer. Ayúdame a priorizar cuáles abrir primero y cómo responder con claridad.`,
    });
  }

  if (input.newLeads > 0) {
    contextual.push({
      id: "suggest:leads",
      title: `${input.newLeads} lead${input.newLeads === 1 ? "" : "s"} nuevo${input.newLeads === 1 ? "" : "s"}`,
      subtitle: "Primer contacto",
      prompt: `Llegaron ${input.newLeads} lead(s) nuevos. Sugiere un primer mensaje y qué datos pedirles.`,
    });
  }

  if (input.activeRounds > 0) {
    contextual.push({
      id: "suggest:active-rounds",
      title: `${input.activeRounds} ronda${input.activeRounds === 1 ? "" : "s"} en curso`,
      subtitle: "Siguiente paso",
      prompt: `Hay ${input.activeRounds} ronda(s) de disputa en curso. ¿Qué debería revisar o preparar ahora?`,
    });
  }

  if (input.openCases > 0 && contextual.length < 2) {
    contextual.push({
      id: "suggest:open-cases",
      title: `${input.openCases} casos abiertos`,
      subtitle: "Vista general",
      prompt: `Tenemos ${input.openCases} caso(s) abierto(s). Dame un resumen de cómo priorizarlos esta semana.`,
    });
  }

  const rotated = rotate(EVERGREEN, daySeed(now));
  const seen = new Set(contextual.map((c) => c.id));
  const merged = [...contextual];

  for (const tip of rotated) {
    if (merged.length >= limit) break;
    if (seen.has(tip.id)) continue;
    seen.add(tip.id);
    merged.push(tip);
  }

  return merged.slice(0, limit);
}
