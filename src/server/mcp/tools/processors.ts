import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import {
  linkProcessorAccountSchema,
  processorCreateSchema,
  processorUpdateSchema,
  updateProcessorAccountSchema,
} from "@/src/lib/validation/processors";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as processors from "@/src/server/processors";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de procesadores (servicios externos de monitoreo de crédito) y de las cuentas
 * que los clientes tienen en ellos. Cada herramienta replica su action de
 * `src/actions/processors.ts`: mismo permiso (`processors.manage`), mismos esquemas y mismo
 * servicio. Un procesador no se borra: se desactiva con `active: false`.
 *
 * Las lecturas del conector nunca devuelven el enlace de afiliado, el identificador externo
 * ni la dirección de la cuenta del cliente: solo si existen.
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

const PROCESADORES_HREF = "/crm/procesadores";

/** Igual que `revalidateProcessors` de la action. */
function processorRoutes(clientId?: string | null): RevalidateTarget[] {
  const routes: RevalidateTarget[] = [PROCESADORES_HREF];
  if (clientId) routes.push(`/crm/clientes/${clientId}`, `/crm/clientes/${clientId}/expediente`);
  return routes;
}

/** En la action, "" significa "sin valor" al crear y "borrar" al editar. */
const blank = (value: string | null | undefined) => (value === "" ? null : value);

const procesadorId = cuidSchema.describe("Identificador del procesador (se obtiene con `listar` en la sección procesadores).");
const cuentaId = cuidSchema.describe("Identificador de la cuenta del cliente en el procesador (se obtiene con `ver` en la sección procesadores).");
const nombreDesc = "Nombre del procesador (obligatorio, máximo 150 caracteres).";
const tipoDesc = "Tipo de servicio (máximo 50 caracteres); por defecto CREDIT_MONITOR.";
const webDesc = "Dirección web del procesador (debe empezar con http:// o https://); \"\" la borra.";
const afiliadoDesc = "Enlace de afiliado (máximo 2000 caracteres); \"\" lo borra. Claude nunca lo vuelve a leer.";
const precioDesc = "Precio mensual en USD.";
const comisionDesc = "Comisión en USD.";
const instruccionesDesc = "Instrucciones internas para el equipo (máximo 5000 caracteres); \"\" las borra.";
const activoDesc = "false desactiva el procesador (no se borra); true lo reactiva.";
const externoDesc = "Identificador del cliente en el procesador (máximo 200 caracteres); \"\" lo borra. Claude nunca lo vuelve a leer.";
const urlCuentaDesc = "Enlace a la cuenta del cliente en el procesador (máximo 2000 caracteres); \"\" lo borra. Claude nunca lo vuelve a leer.";
const estadoCuentaDesc = "Estado de la cuenta: PLANNED, ACTIVE, EXPIRED o CANCELLED.";
const inicioDesc = "Fecha de inicio (instante completo, p. ej. 2026-12-01T12:00:00Z); null la quita.";
const vencimientoDesc = "Fecha de vencimiento (instante completo, p. ej. 2027-12-01T12:00:00Z); null la quita.";
const notasCuentaDesc = "Notas de la cuenta (máximo 2000 caracteres); \"\" las borra.";

const auditProcessor = (input: object, result: unknown) => ({
  entityType: "CreditProcessor",
  entityId: (result as { id?: string } | null)?.id ?? (input as { procesadorId?: string }).procesadorId ?? null,
});
const auditAccount = (input: object, result: unknown) => ({
  entityType: "ClientProcessorAccount",
  entityId: (result as { id?: string } | null)?.id ?? (input as { cuentaId?: string }).cuentaId ?? null,
});

const crearProcesador = defineTool({
  name: "crear_procesador",
  title: "Crear procesador",
  description:
    "Registra un procesador (servicio externo de monitoreo de crédito) con su precio y comisión. No contacta al procesador ni crea cuentas: solo lo da de alta en el CRM. Solo dueños, administradores y especialistas.",
  kind: "write",
  permission: "processors.manage",
  inputSchema: z.object({
    name: processorCreateSchema.shape.name.describe(nombreDesc),
    type: processorCreateSchema.shape.type.describe(tipoDesc),
    websiteUrl: processorCreateSchema.shape.websiteUrl.describe(webDesc),
    affiliateUrl: processorCreateSchema.shape.affiliateUrl.describe(afiliadoDesc),
    monthlyPrice: processorCreateSchema.shape.monthlyPrice.describe(precioDesc),
    commission: processorCreateSchema.shape.commission.describe(comisionDesc),
    instructions: processorCreateSchema.shape.instructions.describe(instruccionesDesc),
    active: processorCreateSchema.shape.active.describe("false lo crea desactivado; por defecto true."),
  }),
  async run(ctx, input) {
    const data = processorCreateSchema.parse(input);
    const processor = await orNotFound(() =>
      processors.createProcessor(ctx, {
        ...data,
        websiteUrl: data.websiteUrl || null,
        affiliateUrl: data.affiliateUrl || null,
        instructions: data.instructions || null,
      }),
    );
    return { id: processor.id, name: processor.name, active: processor.active, href: PROCESADORES_HREF };
  },
  audit: auditProcessor,
  revalidate: () => processorRoutes(),
});

const editarProcesador = defineTool({
  name: "editar_procesador",
  title: "Editar procesador",
  description:
    "Cambia los datos de un procesador; solo se cambia lo que se envía. Para dejar de ofrecerlo usa `active: false` (no se borra). Solo dueños, administradores y especialistas.",
  kind: "write",
  permission: "processors.manage",
  inputSchema: z.object({
    procesadorId,
    name: processorUpdateSchema.shape.name.describe(nombreDesc),
    type: processorUpdateSchema.shape.type.describe(tipoDesc),
    websiteUrl: processorUpdateSchema.shape.websiteUrl.describe(webDesc),
    affiliateUrl: processorUpdateSchema.shape.affiliateUrl.describe(afiliadoDesc),
    monthlyPrice: processorUpdateSchema.shape.monthlyPrice.describe(precioDesc),
    commission: processorUpdateSchema.shape.commission.describe(comisionDesc),
    instructions: processorUpdateSchema.shape.instructions.describe(instruccionesDesc),
    active: processorUpdateSchema.shape.active.describe(activoDesc),
  }),
  async run(ctx, { procesadorId: id, ...rest }) {
    const data = processorUpdateSchema.parse(rest);
    const processor = await orNotFound(() =>
      processors.updateProcessor(ctx, id, {
        ...data,
        websiteUrl: blank(data.websiteUrl),
        affiliateUrl: blank(data.affiliateUrl),
        instructions: blank(data.instructions),
      }),
    );
    return { id: processor.id, name: processor.name, active: processor.active, href: PROCESADORES_HREF };
  },
  audit: auditProcessor,
  revalidate: () => processorRoutes(),
});

const vincularCuentaProcesador = defineTool({
  name: "vincular_cuenta_procesador",
  title: "Vincular cliente a un procesador",
  description:
    "Registra en el CRM que un cliente tiene (o tendrá) una cuenta en un procesador, con su estado y fechas. No crea la cuenta en el procesador ni le escribe al cliente: solo deja constancia.",
  kind: "write",
  permission: "processors.manage",
  inputSchema: z.object({
    processorId: linkProcessorAccountSchema.shape.processorId.describe("Identificador del procesador."),
    clientId: linkProcessorAccountSchema.shape.clientId.describe("Identificador del cliente."),
    caseId: linkProcessorAccountSchema.shape.caseId.describe("Identificador del caso de crédito del cliente (opcional)."),
    externalMemberId: linkProcessorAccountSchema.shape.externalMemberId.describe(externoDesc),
    externalUrl: linkProcessorAccountSchema.shape.externalUrl.describe(urlCuentaDesc),
    status: linkProcessorAccountSchema.shape.status.describe(estadoCuentaDesc),
    startedAt: linkProcessorAccountSchema.shape.startedAt.describe(inicioDesc),
    expiresAt: linkProcessorAccountSchema.shape.expiresAt.describe(vencimientoDesc),
    notes: linkProcessorAccountSchema.shape.notes.describe(notasCuentaDesc),
  }),
  async run(ctx, input) {
    const data = linkProcessorAccountSchema.parse(input);
    const account = await orNotFound(() =>
      processors.linkAccount(ctx, {
        ...data,
        externalMemberId: data.externalMemberId || null,
        externalUrl: data.externalUrl || null,
        notes: data.notes || null,
      }),
    );
    return { id: account.id, status: account.status, clientId: account.clientId, href: `/crm/clientes/${account.clientId}` };
  },
  audit: auditAccount,
  revalidate: (result) => processorRoutes((result as { clientId?: string } | null)?.clientId),
});

const editarCuentaProcesador = defineTool({
  name: "editar_cuenta_procesador",
  title: "Editar cuenta de un cliente en un procesador",
  description:
    "Cambia el estado, las fechas, las notas o el caso de la cuenta que un cliente tiene en un procesador; solo se cambia lo que se envía. Para darla de baja usa el estado CANCELLED: no se borra.",
  kind: "write",
  permission: "processors.manage",
  inputSchema: z.object({
    cuentaId,
    externalMemberId: updateProcessorAccountSchema.shape.externalMemberId.describe(externoDesc),
    externalUrl: updateProcessorAccountSchema.shape.externalUrl.describe(urlCuentaDesc),
    status: updateProcessorAccountSchema.shape.status.describe(estadoCuentaDesc),
    startedAt: updateProcessorAccountSchema.shape.startedAt.describe(inicioDesc),
    expiresAt: updateProcessorAccountSchema.shape.expiresAt.describe(vencimientoDesc),
    notes: updateProcessorAccountSchema.shape.notes.describe(notasCuentaDesc),
    caseId: updateProcessorAccountSchema.shape.caseId.describe("Identificador del caso de crédito del cliente; null lo desvincula."),
  }),
  async run(ctx, { cuentaId: id, ...rest }) {
    const data = updateProcessorAccountSchema.parse(rest);
    const account = await orNotFound(() =>
      processors.updateAccount(ctx, id, {
        ...data,
        externalMemberId: blank(data.externalMemberId),
        externalUrl: blank(data.externalUrl),
        notes: blank(data.notes),
      }),
    );
    return { id: account.id, status: account.status, clientId: account.clientId, href: `/crm/clientes/${account.clientId}` };
  },
  audit: auditAccount,
  revalidate: (result) => processorRoutes((result as { clientId?: string } | null)?.clientId),
});

/** Herramientas de escritura de procesadores y sus cuentas. */
export const processorsTools: Tool[] = [
  crearProcesador,
  editarProcesador,
  vincularCuentaProcesador,
  editarCuentaProcesador,
] as Tool[];
