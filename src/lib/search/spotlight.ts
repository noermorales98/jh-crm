import type { PermissionAction } from "@/src/server/auth/permissions";
import { can } from "@/src/server/auth/permissions";
import type { Role } from "@prisma/client";

export type SpotlightKind =
  | "ai"
  | "page"
  | "setting"
  | "client"
  | "opportunity"
  | "case"
  | "round"
  | "task"
  | "service"
  | "package"
  | "quote"
  | "payment"
  | "plan"
  | "receipt"
  | "consultation"
  | "contract"
  | "testimonial"
  | "processor"
  | "mail"
  | "user";

export type SpotlightHit = {
  id: string;
  kind: SpotlightKind;
  title: string;
  subtitle: string;
  href?: string;
  score: number;
};

export const SPOTLIGHT_GROUP_ORDER: SpotlightKind[] = [
  "ai",
  "page",
  "setting",
  "client",
  "opportunity",
  "case",
  "round",
  "task",
  "service",
  "package",
  "quote",
  "payment",
  "plan",
  "receipt",
  "consultation",
  "contract",
  "testimonial",
  "processor",
  "mail",
  "user",
];

export const SPOTLIGHT_GROUP_LABEL: Record<SpotlightKind, string> = {
  ai: "Asistente",
  page: "Páginas",
  setting: "Configuración",
  client: "Clientes",
  opportunity: "Leads",
  case: "Casos",
  round: "Rondas",
  task: "Tareas",
  service: "Servicios",
  package: "Paquetes",
  quote: "Cotizaciones",
  payment: "Pagos",
  plan: "Cuotas",
  receipt: "Recibos",
  consultation: "Consultas",
  contract: "Contratos",
  testimonial: "Testimonios",
  processor: "Procesadores",
  mail: "Correos",
  user: "Usuarios",
};

type CatalogEntry = {
  id: string;
  kind: "page" | "setting";
  title: string;
  subtitle: string;
  href: string;
  aliases: string[];
  permission?: PermissionAction;
};

const CATALOG: CatalogEntry[] = [
  {
    id: "page-home",
    kind: "page",
    title: "Inicio",
    subtitle: "Resumen del CRM",
    href: "/crm/dashboard",
    aliases: ["dashboard", "home", "resumen", "inicio"],
    permission: "dashboard.view",
  },
  {
    id: "page-tareas",
    kind: "page",
    title: "Pendientes",
    subtitle: "Tareas y seguimiento",
    href: "/crm/tareas",
    aliases: ["tareas", "to-do", "pendientes", "todo"],
    permission: "tasks.view",
  },
  {
    id: "page-oportunidades",
    kind: "page",
    title: "Leads",
    subtitle: "Oportunidades y seguimiento comercial",
    href: "/crm/oportunidades",
    aliases: ["leads", "oportunidades", "pipeline comercial", "prospectos"],
    permission: "opportunities.view",
  },
  {
    id: "page-clientes",
    kind: "page",
    title: "Clientes",
    subtitle: "Lista y fichas",
    href: "/crm/clientes",
    aliases: ["clientes", "contactos", "fichas"],
    permission: "clients.view",
  },
  {
    id: "page-cliente-nuevo",
    kind: "page",
    title: "Nuevo cliente",
    subtitle: "Alta de ficha",
    href: "/crm/clientes/nuevo",
    aliases: ["alta", "crear cliente", "nuevo cliente"],
    permission: "clients.create",
  },
  {
    id: "page-casos",
    kind: "page",
    title: "Casos",
    subtitle: "Pipeline de crédito",
    href: "/crm/casos",
    aliases: ["casos", "pipeline", "expedientes"],
    permission: "cases.view",
  },
  {
    id: "page-rondas",
    kind: "page",
    title: "Rondas",
    subtitle: "Disputas y revisiones",
    href: "/crm/rondas",
    aliases: ["rondas", "disputas", "cartas", "revisiones"],
    permission: "rounds.view",
  },
  {
    id: "page-consultas",
    kind: "page",
    title: "Consultas",
    subtitle: "Solicitudes de consulta del sitio",
    href: "/crm/consultas",
    aliases: ["consultas", "consulta", "agenda"],
    permission: "consultations.view",
  },
  {
    id: "page-servicios",
    kind: "page",
    title: "Servicios",
    subtitle: "Catálogo",
    href: "/crm/servicios",
    aliases: ["servicios", "catalogo", "catálogo"],
    permission: "catalog.view",
  },
  {
    id: "page-paquetes",
    kind: "page",
    title: "Paquetes",
    subtitle: "Combinaciones del catálogo",
    href: "/crm/servicios/paquetes",
    aliases: ["paquetes", "bundles"],
    permission: "catalog.view",
  },
  {
    id: "page-cotizaciones",
    kind: "page",
    title: "Cotizaciones",
    subtitle: "Presupuestos",
    href: "/crm/cotizaciones",
    aliases: ["cotizaciones", "quotes", "presupuestos"],
    permission: "quotes.view",
  },
  {
    id: "page-cotizacion-nueva",
    kind: "page",
    title: "Nueva cotización",
    subtitle: "Crear presupuesto",
    href: "/crm/cotizaciones/nueva",
    aliases: ["nueva cotizacion", "nueva cuota", "crear cotizacion"],
    permission: "quotes.manage",
  },
  {
    id: "page-pagos",
    kind: "page",
    title: "Pagos",
    subtitle: "Pendientes y recibidos",
    href: "/crm/pagos",
    aliases: ["pagos", "cobros", "cobrar", "zelle", "stripe"],
    permission: "payments.view",
  },
  {
    id: "page-pago-nuevo",
    kind: "page",
    title: "Registrar pago",
    subtitle: "Nuevo cobro",
    href: "/crm/pagos/nuevo",
    aliases: ["registrar pago", "nuevo pago", "nuevo cobro"],
    permission: "payments.register",
  },
  {
    id: "page-planes-pago",
    kind: "page",
    title: "Cuotas",
    subtitle: "Planes de pago e installments",
    href: "/crm/planes-pago",
    aliases: ["cuotas", "planes", "planes de pago", "installments", "parcialidades"],
    permission: "payments.view",
  },
  {
    id: "page-recibos",
    kind: "page",
    title: "Recibos",
    subtitle: "Folios emitidos",
    href: "/crm/recibos",
    aliases: ["recibos", "folios", "comprobantes"],
    permission: "receipts.view",
  },
  {
    id: "page-chats",
    kind: "page",
    title: "Chats",
    subtitle: "Historial del asistente",
    href: "/crm/chats",
    aliases: ["chats", "ia", "asistente", "conversaciones"],
  },
  {
    id: "page-mails",
    kind: "page",
    title: "Correos",
    subtitle: "Bandeja de la organización",
    href: "/crm/mails?folder=inbox",
    aliases: ["correos", "mails", "inbox", "bandeja", "mensajes"],
    permission: "mails.view",
  },
  {
    id: "page-mail-nuevo",
    kind: "page",
    title: "Redactar correo",
    subtitle: "Nuevo mensaje",
    href: "/crm/mails/nuevo",
    aliases: ["redactar", "enviar correo", "nuevo correo"],
    permission: "mails.manage",
  },
  {
    id: "page-testimonios",
    kind: "page",
    title: "Testimonios",
    subtitle: "Reseñas de clientes",
    href: "/crm/testimonios",
    aliases: ["testimonios", "reseñas", "reviews"],
    permission: "testimonials.view",
  },
  {
    id: "page-contratos",
    kind: "page",
    title: "Contratos",
    subtitle: "Plantillas y firmas",
    href: "/crm/contratos",
    aliases: ["contratos", "firmas", "acuerdos"],
    permission: "contracts.view",
  },
  {
    id: "page-procesadores",
    kind: "page",
    title: "Procesadores",
    subtitle: "Monitores y afiliados de crédito",
    href: "/crm/procesadores",
    aliases: ["procesadores", "monitores", "afiliados", "credit monitor"],
    permission: "processors.view",
  },
  {
    id: "page-usuarios",
    kind: "page",
    title: "Usuarios",
    subtitle: "Miembros e invitaciones",
    href: "/crm/usuarios",
    aliases: ["usuarios", "equipo", "miembros"],
    permission: "users.manage",
  },
  {
    id: "page-auditoria",
    kind: "page",
    title: "Auditoría",
    subtitle: "Eventos sensibles",
    href: "/crm/auditoria",
    aliases: ["auditoria", "auditoría", "logs"],
    permission: "audit.view",
  },
  {
    id: "set-config",
    kind: "setting",
    title: "Configuración",
    subtitle: "Empresa, moneda y prefijos",
    href: "/crm/configuracion",
    aliases: ["configuracion", "configuración", "ajustes", "settings", "empresa"],
    permission: "settings.manage",
  },
  {
    id: "set-etapas",
    kind: "setting",
    title: "Etapas del pipeline",
    subtitle: "Nombre, color y orden",
    href: "/crm/configuracion/etapas",
    aliases: ["etapas", "pipeline", "workflow"],
    permission: "settings.manage",
  },
  {
    id: "set-notif",
    kind: "setting",
    title: "Notificaciones",
    subtitle: "Correo y WhatsApp",
    href: "/crm/configuracion/notificaciones",
    aliases: ["notificaciones", "whatsapp", "smtp", "callmebot"],
    permission: "settings.manage",
  },
  {
    id: "set-seguridad",
    kind: "setting",
    title: "Seguridad",
    subtitle: "MFA / autenticación en dos pasos",
    href: "/crm/configuracion/seguridad",
    aliases: ["seguridad", "mfa", "2fa", "totp", "autenticacion"],
  },
];

export function normalizeQuery(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

export function isAiIntent(raw: string): boolean {
  const value = raw.trim();
  if (!value) return false;
  if (value.startsWith("?") || value.startsWith(">")) return true;
  if (value.endsWith("?")) return true;
  return /^(que |qué |como |cómo |quien |quién |donde |dónde |cuando |cuándo |por que |por qué |cuanto |cuánto |lista |muestrame |muéstrame |mostrame |explica |ayudame |ayúdame |ayuda |puedes |busca en ia)/i.test(
    value,
  );
}

export function aiPromptFromQuery(raw: string): string {
  return raw.trim().replace(/^[>?]\s*/, "");
}

export function scoreText(query: string, ...fields: string[]): number {
  const q = normalizeQuery(query);
  if (!q) return 0;
  let best = 0;
  for (const field of fields) {
    const t = normalizeQuery(field);
    if (!t) continue;
    if (t === q) best = Math.max(best, 100);
    else if (t.startsWith(q)) best = Math.max(best, 86);
    else if (` ${t}`.includes(` ${q}`)) best = Math.max(best, 72);
    else if (t.includes(q)) best = Math.max(best, 54);
    else {
      const words = q.split(/\s+/).filter((w) => w.length > 1);
      if (words.length && words.every((w) => t.includes(w))) {
        best = Math.max(best, 40);
      }
    }
  }
  return best;
}

export function matchCatalog(raw: string, role: Role | null | undefined): SpotlightHit[] {
  const q = normalizeQuery(raw);
  return CATALOG.flatMap((entry) => {
    if (entry.permission && !can(role, entry.permission)) return [];
    const score = q
      ? scoreText(q, entry.title, entry.subtitle, ...entry.aliases)
      : 12;
    if (q && score < 40) return [];
    return [
      {
        id: entry.id,
        kind: entry.kind,
        title: entry.title,
        subtitle: entry.subtitle,
        href: entry.href,
        score: q ? score : 12,
      },
    ];
  }).sort((a, b) => b.score - a.score);
}

export function buildAiHit(raw: string): SpotlightHit {
  const prompt = aiPromptFromQuery(raw);
  return {
    id: "ai-ask",
    kind: "ai",
    title: prompt ? `Preguntar a la IA` : "Preguntar al asistente",
    subtitle: prompt
      ? prompt
      : "Escribe una pregunta sobre clientes, pagos o cómo hacer algo",
    score: isAiIntent(raw) ? 120 : prompt ? 70 : 20,
  };
}

export function mergeSpotlightHits(
  groups: SpotlightHit[][],
  query: string,
  limit = 40,
): SpotlightHit[] {
  const seen = new Set<string>();
  const merged = groups
    .flat()
    .filter((hit) => {
      if (seen.has(hit.id)) return false;
      seen.add(hit.id);
      return true;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (
        SPOTLIGHT_GROUP_ORDER.indexOf(a.kind) -
        SPOTLIGHT_GROUP_ORDER.indexOf(b.kind)
      );
    });

  const ai = buildAiHit(query);
  const withoutAi = merged.filter((hit) => hit.kind !== "ai");
  // Sin query: muestra todo el catálogo (páginas + settings) + IA al final.
  if (!query.trim()) {
    return [...withoutAi, ai];
  }
  const picked = withoutAi.slice(0, limit - 1);
  return [ai, ...picked];
}

export function groupSpotlightHits(hits: SpotlightHit[]): {
  kind: SpotlightKind;
  label: string;
  hits: SpotlightHit[];
}[] {
  const buckets = new Map<SpotlightKind, SpotlightHit[]>();
  for (const hit of hits) {
    const list = buckets.get(hit.kind) ?? [];
    list.push(hit);
    buckets.set(hit.kind, list);
  }
  return SPOTLIGHT_GROUP_ORDER.flatMap((kind) => {
    const list = buckets.get(kind);
    if (!list?.length) return [];
    return [{ kind, label: SPOTLIGHT_GROUP_LABEL[kind], hits: list }];
  });
}
