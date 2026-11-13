import { z } from "zod";
import { cuidSchema, resolveOrgDateInput } from "@/src/lib/validation/common";
import {
  caseAmountsSchema,
  createCaseSchema,
  createServiceCaseSchema,
  nextActionSchema,
  serviceCaseTransitionSchema,
  updateCaseSchema,
} from "@/src/lib/validation/case-actions";
import { CASE_ROUTE_PATTERN, caseHref } from "@/src/lib/routes/case-routes";
import { DomainError, NotFoundError } from "@/src/server/errors";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import { isServiceCode } from "@/src/server/services/codes";
import * as caseService from "@/src/server/cases";
import * as serviceCaseService from "@/src/server/service-cases";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Herramientas de escritura de casos de crédito y casos de servicio (T018). Cada una
 * refleja su action de `src/actions/cases.ts` o `src/actions/service-cases.ts`: mismo
 * permiso, mismo esquema, misma preparación de fechas y mismo servicio.
 */

/** Los servicios lanzan DomainError("… no encontrado") con ids ajenos: es "no existe". */
async function orNotFound<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof DomainError && /no encontrad/i.test(error.message)) throw new NotFoundError();
    throw error;
  }
}

const layout = (path: string): RevalidateTarget => ({ path, type: "layout" });

/** Igual que `revalidateCases` de la action de casos (sin repetir rutas). */
function caseRoutes(clientId?: string): RevalidateTarget[] {
  const routes: RevalidateTarget[] = [layout(CASE_ROUTE_PATTERN), "/crm/dashboard"];
  if (clientId) {
    routes.push(`/crm/clientes/${clientId}`, `/crm/clientes/${clientId}/servicios`, `/crm/clientes/${clientId}/casos`);
  }
  return routes;
}

/** Igual que `revalidateServiceCase` de la action de casos de servicio. */
function serviceCaseRoutes(serviceCaseId: string, clientId?: string): RevalidateTarget[] {
  return [`/crm/expedientes/${serviceCaseId}`, ...caseRoutes(clientId)];
}

interface CaseResult {
  id: string;
  clientId: string;
  href: string;
}
interface ServiceCaseResult {
  id: string;
  clientId?: string;
  href: string;
}

const caseIdField = cuidSchema.describe("Id del caso de crédito.");
const serviceCaseIdField = cuidSchema.describe("Id del expediente (caso de servicio).");

const caseAudit = (input: { caseId: string }) => ({ entityType: "CreditCase", entityId: input.caseId });
const caseRevalidate = (result: unknown) => caseRoutes((result as CaseResult).clientId);
const serviceAudit = (input: { serviceCaseId: string }) => ({
  entityType: "ServiceCase",
  entityId: input.serviceCaseId,
});
const serviceRevalidate = (result: unknown, input: { serviceCaseId: string }) =>
  serviceCaseRoutes(input.serviceCaseId, (result as ServiceCaseResult).clientId);

const caseOut = (c: { id: string; clientId: string }): CaseResult => ({
  id: c.id,
  clientId: c.clientId,
  href: caseHref(c.clientId, c.id),
});
const serviceOut = (id: string, clientId?: string): ServiceCaseResult => ({
  id,
  clientId,
  href: `/crm/expedientes/${id}`,
});

/** Importes: nulo borra el monto, ausente lo deja igual (como la action). */
function moneyPatch(data: z.infer<typeof caseAmountsSchema>) {
  return {
    quotedAmount: data.quotedAmount === undefined ? undefined : data.quotedAmount || null,
    agreedAmount: data.agreedAmount === undefined ? undefined : data.agreedAmount || null,
  };
}

// ---------------------------------------------------------------- casos de crédito

const crearCaso = defineTool({
  name: "crear_caso",
  title: "Crear caso de crédito",
  description:
    "Abre un caso nuevo de reparación de crédito (expediente con su ficha de crédito) para un cliente existente. Úsala cuando la persona pida abrir o iniciar un caso de crédito; si no indica etapa, empieza en la primera etapa activa.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: createCaseSchema,
  async run(ctx, input) {
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const created = await orNotFound(() =>
      caseService.createCreditCase(ctx, { ...input, nextActionAt: resolveOrgDateInput(input.nextActionAt, tz, 12) }),
    );
    return {
      ...caseOut(created),
      caseCode: created.caseCode,
      serviceCaseId: created.serviceCaseId,
    };
  },
  audit: (_input, result) => ({ entityType: "CreditCase", entityId: (result as CaseResult).id }),
  revalidate: caseRevalidate,
});

const editarCaso = defineTool({
  name: "editar_caso",
  title: "Editar caso de crédito",
  description:
    "Cambia el resumen o el responsable de un caso de crédito existente. Úsala cuando la persona pida reasignar el caso o actualizar su resumen; no cambia la etapa ni el estado.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: updateCaseSchema.extend({ caseId: caseIdField }),
  async run(ctx, input) {
    const { caseId, ...data } = input;
    return caseOut(await orNotFound(() => caseService.updateCreditCase(ctx, caseId, data)));
  },
  audit: caseAudit,
  revalidate: caseRevalidate,
});

const editarImportesCaso = defineTool({
  name: "editar_importes_caso",
  title: "Editar importes del caso de crédito",
  description:
    "Fija el monto cotizado y/o el acordado de un caso de crédito. Úsala cuando la persona diga cuánto se cotizó o se acordó; un valor nulo borra el monto y omitir un campo lo deja como está.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: caseAmountsSchema.extend({ caseId: caseIdField }),
  async run(ctx, input) {
    const { caseId, ...data } = input;
    return caseOut(await orNotFound(() => caseService.updateCaseAmounts(ctx, caseId, moneyPatch(data))));
  },
  audit: caseAudit,
  revalidate: caseRevalidate,
});

const moverCasoEtapa = defineTool({
  name: "mover_caso_etapa",
  title: "Mover caso de crédito de etapa",
  description:
    "Mueve un caso de crédito abierto a otra etapa de su flujo y crea la tarea de seguimiento sugerida para esa etapa. Úsala cuando la persona pida avanzar o retroceder el caso; un caso cerrado no se puede mover.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: z.object({
    caseId: caseIdField,
    stageId: cuidSchema.describe("Id de la etapa destino (debe ser una etapa activa del mismo servicio)."),
  }),
  async run(ctx, input) {
    const moved = await orNotFound(() => caseService.moveCaseToStage(ctx, input.caseId, input.stageId));
    return { ...caseOut(moved), suggestedTaskId: moved.suggestedTaskId ?? null };
  },
  audit: caseAudit,
  revalidate(result) {
    const r = result as CaseResult & { suggestedTaskId: string | null };
    const routes = [...caseRoutes(r.clientId), "/crm/tareas"];
    if (r.suggestedTaskId) routes.push(`/crm/tareas/${r.suggestedTaskId}`);
    return routes;
  },
});

const idOnly = z.object({ caseId: caseIdField });

const pausarCaso = defineTool({
  name: "pausar_caso",
  title: "Pausar caso de crédito",
  description:
    "Pone en pausa un caso de crédito abierto, sin perder su historial. Úsala cuando la persona pida detener temporalmente el caso; se reanuda con reabrir_caso.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: idOnly,
  async run(ctx, input) {
    return caseOut(await orNotFound(() => caseService.pauseCase(ctx, input.caseId)));
  },
  audit: caseAudit,
  revalidate: caseRevalidate,
});

const completarCaso = defineTool({
  name: "completar_caso",
  title: "Completar caso de crédito",
  description:
    "Marca un caso de crédito como completado y registra la fecha de cierre; el caso y su historial se conservan. Úsala cuando la persona diga que el caso terminó; se puede deshacer con reabrir_caso.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: idOnly,
  async run(ctx, input) {
    return caseOut(await orNotFound(() => caseService.completeCase(ctx, input.caseId)));
  },
  audit: caseAudit,
  revalidate: caseRevalidate,
});

const reabrirCaso = defineTool({
  name: "reabrir_caso",
  title: "Reabrir caso de crédito",
  description:
    "Vuelve a abrir un caso de crédito que estaba pausado, completado o cancelado. Úsala cuando la persona quiera retomar un caso cerrado o en pausa.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: idOnly,
  async run(ctx, input) {
    return caseOut(await orNotFound(() => caseService.reopenCase(ctx, input.caseId)));
  },
  audit: caseAudit,
  revalidate: caseRevalidate,
});

const fijarProximaAccionCaso = defineTool({
  name: "fijar_proxima_accion_caso",
  title: "Fijar próxima acción del caso",
  description:
    "Programa la fecha de la próxima acción de un caso de crédito (y su tarea de seguimiento), o la borra si se envía nulo. Úsala cuando la persona diga cuándo hay que volver a tocar el caso.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: nextActionSchema.extend({ caseId: caseIdField }),
  async run(ctx, input) {
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const updated = await orNotFound(() =>
      caseService.setNextActionAt(ctx, input.caseId, resolveOrgDateInput(input.nextActionAt, tz, 12) ?? null),
    );
    return caseOut(updated);
  },
  audit: caseAudit,
  revalidate: caseRevalidate,
});

// ---------------------------------------------------------------- casos de servicio

const crearCasoServicio = defineTool({
  name: "crear_caso_servicio",
  title: "Crear caso de servicio",
  description:
    "Abre un expediente nuevo de cualquier servicio (crédito, compra de casa, financiamiento de negocio, préstamo personal, desarrollo web o CRM) para un cliente existente. Úsala cuando la persona pida abrir un expediente y diga de qué servicio es.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: createServiceCaseSchema,
  async run(ctx, input) {
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const serviceCode = input.serviceCode;
    if (!isServiceCode(serviceCode)) throw new DomainError("Código de servicio inválido.");
    const { serviceCase, creditCase } = await orNotFound(() =>
      caseService.createServiceCase(ctx, {
        ...input,
        serviceCode,
        nextActionAt: resolveOrgDateInput(input.nextActionAt, tz, 12),
      }),
    );
    return {
      id: serviceCase.id,
      serviceCaseId: serviceCase.id,
      caseId: creditCase?.id ?? null,
      caseNumber: serviceCase.caseNumber,
      clientId: serviceCase.clientId,
      href: creditCase ? caseHref(serviceCase.clientId, creditCase.id) : `/crm/expedientes/${serviceCase.id}`,
    };
  },
  audit: (_input, result) => ({ entityType: "ServiceCase", entityId: (result as { id: string }).id }),
  revalidate: (result) => serviceCaseRoutes((result as { id: string }).id, (result as { clientId: string }).clientId),
});

const moverCasoServicioEtapa = defineTool({
  name: "mover_caso_servicio_etapa",
  title: "Mover caso de servicio de etapa",
  description:
    "Mueve un expediente abierto a otra etapa activa de su servicio. Úsala cuando la persona pida avanzar o retroceder un expediente; uno completado o cancelado no se puede mover.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: z.object({
    serviceCaseId: serviceCaseIdField,
    stageId: cuidSchema.describe("Id de la etapa destino (debe ser una etapa activa del servicio del expediente)."),
  }),
  async run(ctx, input) {
    const updated = await orNotFound(() =>
      serviceCaseService.moveServiceCaseToStage(ctx, input.serviceCaseId, input.stageId),
    );
    return serviceOut(input.serviceCaseId, updated.clientId);
  },
  audit: serviceAudit,
  revalidate: serviceRevalidate,
});

const fijarProximaAccionCasoServicio = defineTool({
  name: "fijar_proxima_accion_caso_servicio",
  title: "Fijar próxima acción del caso de servicio",
  description:
    "Programa la fecha de la próxima acción de un expediente (y su tarea de seguimiento), o la borra si se envía nulo. Úsala cuando la persona diga cuándo hay que volver a tocar el expediente.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: nextActionSchema.extend({ serviceCaseId: serviceCaseIdField }),
  async run(ctx, input) {
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const updated = await orNotFound(() =>
      serviceCaseService.setServiceCaseNextActionAt(
        ctx,
        input.serviceCaseId,
        resolveOrgDateInput(input.nextActionAt, tz, 12) ?? null,
      ),
    );
    return serviceOut(input.serviceCaseId, updated.clientId);
  },
  audit: serviceAudit,
  revalidate: serviceRevalidate,
});

const cambiarEstadoCasoServicio = defineTool({
  name: "cambiar_estado_caso_servicio",
  title: "Cambiar estado del caso de servicio",
  description:
    "Cambia el estado de un expediente: abrir (OPEN), pausar (ON_HOLD), completar (COMPLETED) o cancelar (CANCELED). Cancelar y completar son lógicos: el expediente y su historial se conservan y se puede reabrir con OPEN. Pide confirmación a la persona antes de completar o cancelar.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: z.object({ serviceCaseId: serviceCaseIdField, status: serviceCaseTransitionSchema }),
  async run(ctx, input) {
    const updated = await orNotFound(() =>
      serviceCaseService.transitionServiceCase(ctx, input.serviceCaseId, input.status),
    );
    return { ...serviceOut(input.serviceCaseId, updated.clientId), status: updated.status };
  },
  audit: serviceAudit,
  revalidate: serviceRevalidate,
});

const editarImportesCasoServicio = defineTool({
  name: "editar_importes_caso_servicio",
  title: "Editar importes del caso de servicio",
  description:
    "Fija el monto cotizado y/o el acordado de un expediente. Úsala cuando la persona diga cuánto se cotizó o se acordó; un valor nulo borra el monto y omitir un campo lo deja como está.",
  kind: "write",
  permission: "cases.manage",
  inputSchema: caseAmountsSchema.extend({ serviceCaseId: serviceCaseIdField }),
  async run(ctx, input) {
    const { serviceCaseId, ...data } = input;
    await orNotFound(() => serviceCaseService.updateServiceCaseAmounts(ctx, serviceCaseId, moneyPatch(data)));
    return serviceOut(serviceCaseId);
  },
  audit: serviceAudit,
  revalidate: serviceRevalidate,
});

/** Herramientas de escritura de casos de crédito y de servicio (T018). */
export const casesTools: Tool[] = [
  crearCaso,
  editarCaso,
  editarImportesCaso,
  moverCasoEtapa,
  pausarCaso,
  completarCaso,
  reabrirCaso,
  fijarProximaAccionCaso,
  crearCasoServicio,
  moverCasoServicioEtapa,
  fijarProximaAccionCasoServicio,
  cambiarEstadoCasoServicio,
  editarImportesCasoServicio,
] as Tool[];
