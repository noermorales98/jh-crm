import { z } from "zod";
import { ForbiddenError } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import { resolveOrgDateInput, cuidSchema } from "@/src/lib/validation/common";
import {
  leadCreateSchema,
  opportunityCreateSchema,
  opportunityMarkLostSchema,
  opportunityMarkWonSchema,
  opportunityUpdateStageSchema,
} from "@/src/lib/validation/opportunities";
import { CASE_ROUTE_PATTERN } from "@/src/lib/routes/case-routes";
import * as opportunities from "@/src/server/opportunities";
import { prisma } from "@/src/lib/db";
import { DomainError, NotFoundError } from "@/src/server/errors";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Herramientas de escritura de oportunidades y prospectos. Reflejan una a una las
 * acciones de `src/actions/opportunities.ts`: mismo permiso, mismo esquema, mismo
 * servicio y los mismos refrescos. Permiso, validación, auditoría y refresco los
 * aplica el despachador.
 */

/** Los mismos refrescos que `revalidateOpportunities` de la action. */
function opportunityPaths(clientId?: string, caseId?: string): RevalidateTarget[] {
  const paths: RevalidateTarget[] = [
    { path: "/crm/oportunidades", type: "layout" },
    { path: "/crm/oportunidades", type: "page" },
    "/crm/clientes",
    "/crm/dashboard",
  ];
  if (clientId) {
    paths.push(`/crm/clientes/${clientId}`, `/crm/clientes/${clientId}/casos`, `/crm/clientes/${clientId}/servicios`);
  }
  if (caseId) paths.push({ path: CASE_ROUTE_PATTERN, type: "layout" });
  return paths;
}

const opportunityId = cuidSchema.describe("Id de la oportunidad (sácalo de `listar` con la sección oportunidades).");

const leadShape = leadCreateSchema.shape;
const leadFields = {
  firstName: leadShape.firstName.describe("Nombre del prospecto (obligatorio)."),
  lastName: leadShape.lastName.describe("Apellido del prospecto."),
  email: leadShape.email.describe("Correo del prospecto."),
  phone: leadShape.phone.describe("Teléfono del prospecto."),
  source: leadShape.source.describe("De dónde llegó el prospecto (texto libre)."),
  leadChannel: leadShape.leadChannel.describe(
    "Canal de entrada: FACEBOOK, INSTAGRAM, GOOGLE, WEBSITE, REFERRAL, MANUAL u OTHER.",
  ),
  serviceRequested: leadShape.serviceRequested.describe("Servicio que pide el prospecto."),
  ownerId: leadShape.ownerId.describe("Id del miembro del equipo responsable (por defecto, quien conecta)."),
  estimatedValue: leadShape.estimatedValue.describe("Valor estimado del trato en dólares."),
  campaign: leadShape.campaign.describe("Campaña de origen."),
  nextFollowUpAt: leadShape.nextFollowUpAt.describe(
    "Próximo seguimiento: fecha AAAA-MM-DD (en la zona horaria de la organización) o instante completo.",
  ),
};

const createLeadInput = z.object(leadFields);
/**
 * Para editar, todo es opcional: lo que Claude no envía se conserva (la acción de la app
 * recibe el formulario completo; aquí se completa con los valores actuales).
 */
const updateLeadInput = z.object({
  opportunityId,
  ...Object.fromEntries(Object.entries(leadFields).map(([k, v]) => [k, v.optional()])),
}) as unknown as z.ZodObject<{ opportunityId: typeof opportunityId } & { [K in keyof typeof leadFields]: z.ZodOptional<(typeof leadFields)[K]> }>;

/** Etapas abiertas: crear una oportunidad ya ganada o perdida se salta la conversión de la app. */
const OPEN_STAGES = ["NEW_LEAD", "CONTACTED", "CONSULTATION", "INTAKE_SENT", "INTAKE_COMPLETED", "PROPOSAL", "WAITING_PAYMENT"] as const;

const createOpportunityInput = z.object({
  clientId: opportunityCreateSchema.shape.clientId.describe("Id del cliente al que se le abre la oportunidad."),
  ownerId: opportunityCreateSchema.shape.ownerId.describe("Id del miembro del equipo responsable (por defecto, quien conecta)."),
  stage: z
    .enum(OPEN_STAGES)
    .optional()
    .describe(
      "Etapa inicial (por defecto NEW_LEAD): NEW_LEAD, CONTACTED, CONSULTATION, INTAKE_SENT, INTAKE_COMPLETED, PROPOSAL, WAITING_PAYMENT. Para ganar o perder usa marcar_ganada o marcar_perdida.",
    ),
  estimatedValue: opportunityCreateSchema.shape.estimatedValue.describe("Valor estimado del trato en dólares."),
  source: opportunityCreateSchema.shape.source.describe("De dónde llegó el trato (texto libre)."),
  campaign: opportunityCreateSchema.shape.campaign.describe("Campaña de origen."),
  nextFollowUpAt: opportunityCreateSchema.shape.nextFollowUpAt.describe(
    "Próximo seguimiento: fecha AAAA-MM-DD (en la zona horaria de la organización) o instante completo.",
  ),
});

const moveStageInput = z.object({
  opportunityId,
  stage: opportunityUpdateStageSchema.shape.stage.describe(
    "Nueva etapa abierta: NEW_LEAD, CONTACTED, CONSULTATION, INTAKE_SENT, INTAKE_COMPLETED, PROPOSAL o WAITING_PAYMENT. Para cerrar usa marcar_ganada o marcar_perdida.",
  ),
});

const markWonInput = z.object({
  opportunityId,
  serviceCode: opportunityMarkWonSchema.shape.serviceCode.describe(
    "Servicio del caso que se crea (opcional; si falta se deduce del servicio que pidió el cliente): CREDIT_REPAIR, HOME_BUYER, BUSINESS_CREDIT, PERSONAL_LOAN, WEB_DEVELOPMENT o CRM_DEVELOPMENT.",
  ),
});

const markLostInput = z.object({
  opportunityId,
  lostReason: opportunityMarkLostSchema.shape.lostReason.describe("Motivo por el que se perdió la oportunidad."),
});

const oppHref = (clientId: string) => `/crm/oportunidades?clientId=${clientId}`;

async function leadDates(ctx: { organizationId: string }, value: z.infer<typeof createLeadInput>["nextFollowUpAt"]) {
  const tz = await getOrganizationTimezone(ctx.organizationId);
  return resolveOrgDateInput(value, tz, 12) ?? null;
}

function leadData(data: z.infer<typeof createLeadInput>, nextFollowUpAt: Date | null) {
  return {
    firstName: data.firstName,
    lastName: data.lastName || null,
    email: data.email || null,
    phone: data.phone || null,
    source: data.source || null,
    leadChannel: data.leadChannel ?? null,
    serviceRequested: data.serviceRequested || null,
    ownerId: data.ownerId ?? null,
    estimatedValue: data.estimatedValue ?? null,
    campaign: data.campaign || null,
    nextFollowUpAt,
  };
}

type LeadResult = { opportunityId: string; clientId: string; href: string };
const asLead = (result: unknown) => result as LeadResult;
const asId = (result: unknown) => result as { id: string; clientId?: string };

export const opportunitiesTools: Tool[] = [
  defineTool({
    name: "crear_lead",
    title: "Crear prospecto",
    description:
      "Da de alta un prospecto nuevo: crea el cliente (como lead) y su oportunidad en la etapa inicial, con seguimiento opcional. Úsala cuando alguien que aún no está en el CRM muestra interés; si el cliente ya existe, usa crear_oportunidad.",
    inputSchema: createLeadInput,
    permission: "opportunities.manage",
    kind: "write",
    async run(ctx, input) {
      if (!can(ctx.role, "clients.create")) {
        throw new ForbiddenError("Necesitas permiso para crear clientes además de oportunidades.");
      }
      const result = await opportunities.createLead(ctx, leadData(input, await leadDates(ctx, input.nextFollowUpAt)));
      return {
        opportunityId: result.opportunity.id,
        clientId: result.client.id,
        href: oppHref(result.client.id),
      } satisfies LeadResult;
    },
    audit: (_input, result) => ({ entityType: "Opportunity", entityId: asLead(result).opportunityId }),
    revalidate: (result) => opportunityPaths(asLead(result).clientId),
  }),
  defineTool({
    name: "editar_lead",
    title: "Editar prospecto",
    description:
      "Corrige los datos de un prospecto (nombre, contacto, origen, responsable, valor, seguimiento) por el id de su oportunidad. Envía solo lo que cambia: lo que no envíes se conserva. No cambia la etapa ni cierra el trato; para eso usa mover_oportunidad_etapa, marcar_ganada o marcar_perdida.",
    inputSchema: updateLeadInput,
    permission: "opportunities.manage",
    kind: "write",
    async run(ctx, input) {
      if (!can(ctx.role, "clients.edit")) {
        throw new ForbiddenError("Necesitas permiso para editar clientes además de oportunidades.");
      }
      const current = await prisma.opportunity.findFirst({
        where: { id: input.opportunityId, organizationId: ctx.organizationId },
        select: {
          ownerId: true,
          estimatedValue: true,
          source: true,
          campaign: true,
          nextFollowUpAt: true,
          client: {
            select: {
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              leadChannel: true,
              serviceRequested: true,
            },
          },
        },
      });
      if (!current) throw new NotFoundError();
      const keep = <T,>(value: T | undefined, fallback: T) => (value === undefined ? fallback : value);
      const merged = {
        firstName: keep(input.firstName, current.client.firstName),
        lastName: keep(input.lastName, current.client.lastName ?? undefined),
        email: keep(input.email, current.client.email ?? undefined),
        phone: keep(input.phone, current.client.phone ?? undefined),
        source: keep(input.source, current.source ?? undefined),
        leadChannel: keep(input.leadChannel, current.client.leadChannel ?? undefined),
        serviceRequested: keep(input.serviceRequested, current.client.serviceRequested ?? undefined),
        ownerId: keep(input.ownerId, current.ownerId ?? undefined),
        estimatedValue: keep(input.estimatedValue, current.estimatedValue == null ? undefined : Number(current.estimatedValue)),
        campaign: keep(input.campaign, current.campaign ?? undefined),
        nextFollowUpAt: input.nextFollowUpAt,
      } as z.infer<typeof createLeadInput>;
      if (!merged.firstName) throw new DomainError("El nombre es obligatorio.");
      const followUp =
        input.nextFollowUpAt === undefined ? current.nextFollowUpAt : await leadDates(ctx, input.nextFollowUpAt);
      const result = await opportunities.updateLead(ctx, input.opportunityId, leadData(merged, followUp));
      return {
        opportunityId: result.opportunity.id,
        clientId: result.client.id,
        href: oppHref(result.client.id),
      } satisfies LeadResult;
    },
    audit: (_input, result) => ({ entityType: "Opportunity", entityId: asLead(result).opportunityId }),
    revalidate: (result) => [...opportunityPaths(asLead(result).clientId), "/crm/dashboard"],
  }),
  defineTool({
    name: "crear_oportunidad",
    title: "Crear oportunidad",
    description:
      "Abre una oportunidad de venta para un cliente que ya existe, con etapa, valor y seguimiento opcionales. Úsala para un trato nuevo con un cliente conocido; para una persona nueva usa crear_lead.",
    inputSchema: createOpportunityInput,
    permission: "opportunities.manage",
    kind: "write",
    async run(ctx, input) {
      const tz = await getOrganizationTimezone(ctx.organizationId);
      const opp = await opportunities.createOpportunity(ctx, {
        ...input,
        nextFollowUpAt: resolveOrgDateInput(input.nextFollowUpAt, tz, 12),
        source: input.source || null,
        campaign: input.campaign || null,
      });
      return { id: opp.id, clientId: input.clientId, stage: opp.stage, href: oppHref(input.clientId) };
    },
    audit: (_input, result) => ({ entityType: "Opportunity", entityId: asId(result).id }),
    revalidate: (_result, input) => opportunityPaths(input.clientId),
  }),
  defineTool({
    name: "mover_oportunidad_etapa",
    title: "Mover oportunidad de etapa",
    description:
      "Cambia la etapa de una oportunidad abierta (por ejemplo de CONTACTED a PROPOSAL). No sirve para cerrarla: ganar y perder tienen sus propias herramientas, y una oportunidad ya cerrada no se puede mover.",
    inputSchema: moveStageInput,
    permission: "opportunities.manage",
    kind: "write",
    async run(ctx, input) {
      const opp = await opportunities.updateStage(ctx, input.opportunityId, input.stage);
      return { id: opp.id, clientId: opp.clientId, stage: opp.stage, href: oppHref(opp.clientId) };
    },
    audit: (_input, result) => ({ entityType: "Opportunity", entityId: asId(result).id }),
    revalidate: (result) => opportunityPaths(asId(result).clientId),
  }),
  defineTool({
    name: "marcar_ganada",
    title: "Marcar oportunidad como ganada",
    description:
      "Cierra la oportunidad como ganada: activa al cliente y crea su expediente de servicio (con el servicio indicado o el que pidió el cliente). Úsala cuando el cliente aceptó y pagó o firmó; no se puede deshacer desde aquí ni repetir sobre la misma oportunidad.",
    inputSchema: markWonInput,
    permission: "opportunities.manage",
    kind: "write",
    async run(ctx, input) {
      const opp = await opportunities.markWon(ctx, input.opportunityId, { serviceCode: input.serviceCode });
      // Fase 4: el enlace canónico es wonServiceCase; wonCase es legacy.
      const wonCreditCase = opp.wonCase ?? opp.wonServiceCase?.creditCase ?? null;
      return {
        id: opp.id,
        clientId: opp.clientId,
        stage: opp.stage,
        caseId: wonCreditCase?.id ?? null,
        serviceCaseId: opp.wonServiceCaseId,
        caseCode: wonCreditCase?.caseCode ?? opp.wonServiceCase?.caseNumber ?? null,
        href: opp.wonServiceCaseId ? `/crm/expedientes/${opp.wonServiceCaseId}` : oppHref(opp.clientId),
      };
    },
    audit: (_input, result) => ({ entityType: "Opportunity", entityId: asId(result).id }),
    revalidate: (result) => {
      const r = result as { id: string; clientId: string; caseId: string | null; serviceCaseId: string | null };
      const paths = opportunityPaths(r.clientId, r.caseId ?? undefined);
      if (r.serviceCaseId) {
        paths.push(`/crm/expedientes/${r.serviceCaseId}`, `/crm/clientes/${r.clientId}/servicios`);
      }
      return paths;
    },
  }),
  defineTool({
    name: "marcar_perdida",
    title: "Marcar oportunidad como perdida",
    description:
      "Cierra la oportunidad como perdida y guarda el motivo. Pide confirmación a la persona antes de usarla. No se borra nada (la oportunidad y su historial se conservan), pero no se puede reabrir desde el CRM.",
    inputSchema: markLostInput,
    permission: "opportunities.manage",
    kind: "destructive",
    async run(ctx, input) {
      const opp = await opportunities.markLost(ctx, input.opportunityId, input.lostReason);
      return { id: opp.id, clientId: opp.clientId, stage: opp.stage, href: oppHref(opp.clientId) };
    },
    audit: (_input, result) => ({ entityType: "Opportunity", entityId: asId(result).id }),
    revalidate: (result) => opportunityPaths(asId(result).clientId),
  }),
];
