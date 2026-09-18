/**
 * Resumen en lenguaje natural a partir de KPIs del dashboard (sin LLM).
 */

export type DashboardBriefCounts = {
  overdueTasks: number;
  overduePayments: number;
  overdueUpdates: number;
  tasksToday: number;
  openCases: number;
  pendingPayments: number;
  leadsToContact: number;
  documentsPending: number;
  activeClients: number;
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

export function buildDashboardBrief(counts: DashboardBriefCounts): string {
  const urgencies: string[] = [];
  if (counts.overdueTasks > 0) {
    urgencies.push(plural(counts.overdueTasks, "tarea vencida", "tareas vencidas"));
  }
  if (counts.overduePayments > 0) {
    urgencies.push(plural(counts.overduePayments, "pago vencido", "pagos vencidos"));
  }
  if (counts.overdueUpdates > 0) {
    urgencies.push(
      plural(counts.overdueUpdates, "acción de caso vencida", "acciones de caso vencidas"),
    );
  }

  if (urgencies.length > 0) {
    const head =
      urgencies.length === 1
        ? `Hoy tienes ${urgencies[0]}`
        : urgencies.length === 2
          ? `Hoy tienes ${urgencies[0]} y ${urgencies[1]}`
          : `Hoy tienes ${urgencies.slice(0, -1).join(", ")} y ${urgencies[urgencies.length - 1]}`;
    const extra: string[] = [];
    if (counts.tasksToday > 0) {
      extra.push(plural(counts.tasksToday, "pendiente para hoy", "pendientes para hoy"));
    }
    if (counts.pendingPayments > counts.overduePayments) {
      const rest = counts.pendingPayments - counts.overduePayments;
      if (rest > 0) extra.push(plural(rest, "cobro pendiente", "cobros pendientes"));
    }
    if (extra.length > 0) {
      return `${head}. Además, ${extra.join(" y ")}.`;
    }
    return `${head}. Revisa la lista de pendientes abajo.`;
  }

  const calm: string[] = [];
  if (counts.openCases > 0) {
    calm.push(plural(counts.openCases, "caso abierto", "casos abiertos"));
  }
  if (counts.pendingPayments > 0) {
    calm.push(plural(counts.pendingPayments, "pago por cobrar", "pagos por cobrar"));
  }
  if (counts.tasksToday > 0) {
    calm.push(plural(counts.tasksToday, "tarea para hoy", "tareas para hoy"));
  }
  if (counts.leadsToContact > 0) {
    calm.push(plural(counts.leadsToContact, "lead por contactar", "leads por contactar"));
  }
  if (counts.documentsPending > 0) {
    calm.push(
      plural(counts.documentsPending, "caso sin documentos", "casos sin documentos"),
    );
  }

  if (calm.length === 0) {
    if (counts.activeClients > 0) {
      return `Todo al día. Tienes ${plural(counts.activeClients, "cliente activo", "clientes activos")} y nada urgente por ahora.`;
    }
    return "Todo al día. Buen momento para revisar clientes o buscar algo.";
  }

  if (calm.length === 1) {
    return `Sin urgencias. Hay ${calm[0]}.`;
  }
  if (calm.length === 2) {
    return `Sin urgencias. Hay ${calm[0]} y ${calm[1]}.`;
  }
  return `Sin urgencias. Hay ${calm.slice(0, -1).join(", ")} y ${calm[calm.length - 1]}.`;
}

/** Saludo según hora local en la timezone de la organización. */
export function greetingForTimezone(date: Date, timeZone: string): string {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).format(date);
  const hour = Number.parseInt(hourStr, 10);
  if (hour >= 5 && hour < 12) return "Buenos días";
  if (hour >= 12 && hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function firstNameFromDisplayName(name: string | null | undefined): string {
  const trimmed = name?.trim();
  if (!trimmed) return "equipo";
  return trimmed.split(/\s+/)[0] ?? "equipo";
}
