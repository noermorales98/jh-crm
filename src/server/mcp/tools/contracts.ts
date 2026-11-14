import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import { createContractSchema } from "@/src/lib/validation/contracts";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as contracts from "@/src/server/contracts";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de contratos. Cada herramienta replica su action de `src/actions/contracts.ts`:
 * mismo permiso, mismo esquema y mismo servicio.
 *
 * Fuera a propósito: firmar (la firma es del cliente, en persona o en el portal; Claude no
 * firma por nadie) y editar plantillas (texto legal, pendiente de revisión jurídica).
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

const CONTRATOS_HREF = "/crm/contratos";

/** Igual que `revalidateContracts` de la action. */
function contractRoutes(clientId?: string | null): RevalidateTarget[] {
  return clientId ? [CONTRATOS_HREF, `/crm/clientes/${clientId}`] : [CONTRATOS_HREF];
}

interface ContractRow {
  id: string;
  clientId: string;
  status: string;
  title: string;
}

function contractResult(contract: ContractRow) {
  return {
    id: contract.id,
    title: contract.title,
    status: contract.status,
    clientId: contract.clientId,
    href: `/crm/clientes/${contract.clientId}`,
  };
}

const contratoId = cuidSchema.describe("Identificador del contrato (se obtiene con `listar` o `ver` en la sección contratos).");

const auditContract = (input: object, result: unknown) => ({
  entityType: "ClientContract",
  entityId: (result as { id?: string } | null)?.id ?? (input as { contratoId?: string }).contratoId ?? null,
});

const crearContrato = defineTool({
  name: "crear_contrato",
  title: "Crear contrato",
  description:
    "Crea un contrato en borrador para un cliente a partir de una plantilla activa (búscala con `listar` en la sección plantillas_contrato), con el plazo de cancelación en días. No lo envía ni lo firma.",
  kind: "write",
  permission: "contracts.manage",
  inputSchema: z.object({
    clientId: createContractSchema.shape.clientId.describe("Identificador del cliente."),
    caseId: createContractSchema.shape.caseId.describe("Identificador del caso de crédito (opcional)."),
    templateId: createContractSchema.shape.templateId.describe("Identificador de la plantilla de contrato."),
    cancellationDeadlineDays: z
      .number()
      .int()
      .min(3, "Mínimo 3 días de cancelación.")
      .max(365)
      .describe("Días que tiene el cliente para cancelar (de 3 a 365)."),
  }),
  async run(ctx, input) {
    const data = createContractSchema.parse(input);
    const contract = await orNotFound(() => contracts.createContractFromTemplate(ctx, data));
    return contractResult(contract);
  },
  audit: auditContract,
  revalidate: (result) => contractRoutes((result as { clientId?: string } | null)?.clientId),
});

const marcarContratoEnviado = defineTool({
  name: "marcar_contrato_enviado",
  title: "Marcar contrato como enviado",
  description:
    "Marca un contrato en borrador como enviado y le añade la firma del representante de la agencia; desde ese momento el cliente puede firmarlo en el portal. No manda correos ni mensajes. Falla si al contrato le falta título, versión, contenido o plazo de cancelación.",
  kind: "write",
  permission: "contracts.manage",
  inputSchema: z.object({ contratoId }),
  async run(ctx, { contratoId: id }) {
    const contract = await orNotFound(() => contracts.markSent(ctx, id));
    return contractResult(contract);
  },
  audit: auditContract,
  revalidate: (result) => contractRoutes((result as { clientId?: string } | null)?.clientId),
});

const cancelarContrato = defineTool({
  name: "cancelar_contrato",
  title: "Cancelar contrato",
  description:
    "Cancela un contrato que todavía no está firmado: queda en estado CANCELLED y no se borra. Un contrato firmado no se puede cancelar. Pide confirmación a la persona antes de usarla.",
  kind: "destructive",
  permission: "contracts.manage",
  inputSchema: z.object({ contratoId }),
  async run(ctx, { contratoId: id }) {
    const contract = await orNotFound(() => contracts.cancelContract(ctx, id));
    return contractResult(contract);
  },
  audit: auditContract,
  revalidate: (result) => contractRoutes((result as { clientId?: string } | null)?.clientId),
});

/** Herramientas de escritura de la sección contratos. */
export const contractsTools: Tool[] = [crearContrato, marcarContratoEnviado, cancelarContrato] as Tool[];
