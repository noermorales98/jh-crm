import { z } from "zod";
import { cuidSchema, moneySchema } from "@/src/lib/validation/common";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as catalog from "@/src/server/services";
import { SERVICE_CODES } from "@/src/server/services/codes";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura del catálogo (servicios y paquetes). Cada herramienta replica su action de
 * `src/actions/services.ts`: mismo permiso (`catalog.manage`, solo dueños y administradores),
 * mismo esquema, mismo servicio y mismas rutas refrescadas. Archivar solo apaga `isActive`:
 * nada se borra y las cotizaciones y casos que ya usan el servicio no cambian.
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

const SERVICIOS_HREF = "/crm/servicios";
const PAQUETES_HREF = "/crm/servicios/paquetes";

/** Igual que `revalidateCatalog` de la action. */
function catalogRoutes(): RevalidateTarget[] {
  return [SERVICIOS_HREF, PAQUETES_HREF, "/crm/cotizaciones/nueva"];
}

// Mismos esquemas que `src/actions/services.ts` (allí no se exportan).
const serviceSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(150),
  description: z.string().trim().max(2000).nullish(),
  defaultPrice: moneySchema,
  currency: z.string().trim().length(3).optional(),
  code: z.enum(SERVICE_CODES).nullish(),
});
const serviceUpdateSchema = serviceSchema.partial();
const packageSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio.").max(150),
  description: z.string().trim().max(2000).nullish(),
  defaultPrice: moneySchema,
  currency: z.string().trim().length(3).optional(),
  items: z
    .array(
      z.object({
        serviceId: cuidSchema,
        quantity: z.number().int().min(1, "Cantidad mínima 1."),
      }),
    )
    .min(1, "El paquete necesita al menos un servicio."),
});
const packageUpdateSchema = packageSchema.partial();

const servicioId = cuidSchema.describe("Identificador del servicio (se obtiene con `listar` en la sección servicios).");
const paqueteId = cuidSchema.describe("Identificador del paquete (se obtiene con `listar` en la sección paquetes).");
const nombreDesc = "Nombre (obligatorio, máximo 150 caracteres); no puede repetirse dentro de la organización.";
const descripcionDesc = "Descripción interna (máximo 2000 caracteres); null la borra.";
const precioDesc = "Precio por defecto en la moneda indicada (número o texto, por ejemplo 250 o \"250.00\").";
const monedaDesc = "Código de moneda de 3 letras (por defecto USD).";
const itemsDesc =
  "Servicios que incluye, cada uno con su identificador y cantidad (entero, mínimo 1). Deben existir y estar activos. En una edición reemplazan por completo la lista anterior.";

const crearServicio = defineTool({
  name: "crear_servicio",
  title: "Crear servicio del catálogo",
  description:
    "Crea un servicio en el catálogo de la organización, con su precio por defecto. Solo dueños y administradores. El código de vertical (code) enlaza el servicio con flujos del CRM (reparación de crédito, financiamiento…): no lo pongas salvo que la persona lo pida.",
  kind: "write",
  permission: "catalog.manage",
  inputSchema: z.object({
    name: serviceSchema.shape.name.describe(nombreDesc),
    description: serviceSchema.shape.description.describe(descripcionDesc),
    defaultPrice: serviceSchema.shape.defaultPrice.describe(precioDesc),
    currency: serviceSchema.shape.currency.describe(monedaDesc),
    code: serviceSchema.shape.code.describe(`Código de vertical opcional: ${SERVICE_CODES.join(", ")}. Cada código solo puede usarse una vez.`),
  }),
  async run(ctx, input) {
    const service = await orNotFound(() => catalog.createService(ctx, serviceSchema.parse(input)));
    return { id: service.id, name: service.name, href: SERVICIOS_HREF };
  },
  audit: (_input, result) => ({ entityType: "Service", entityId: (result as { id: string }).id }),
  revalidate: () => catalogRoutes(),
});

const editarServicio = defineTool({
  name: "editar_servicio",
  title: "Editar servicio del catálogo",
  description:
    "Cambia el nombre, la descripción, el precio, la moneda o el código de un servicio del catálogo; solo se cambia lo que se envía. Solo dueños y administradores. Cambiar el precio no modifica las cotizaciones ya hechas. No cambies el código de vertical salvo que la persona lo pida: enlaza el servicio con flujos del CRM.",
  kind: "write",
  permission: "catalog.manage",
  inputSchema: z.object({
    servicioId,
    name: serviceUpdateSchema.shape.name.describe(nombreDesc),
    description: serviceUpdateSchema.shape.description.describe(descripcionDesc),
    defaultPrice: serviceUpdateSchema.shape.defaultPrice.describe(precioDesc),
    currency: serviceUpdateSchema.shape.currency.describe(monedaDesc),
    code: serviceUpdateSchema.shape.code.describe(`Código de vertical: ${SERVICE_CODES.join(", ")}; null lo quita.`),
  }),
  async run(ctx, { servicioId: id, ...rest }) {
    const service = await orNotFound(() => catalog.updateService(ctx, id, serviceUpdateSchema.parse(rest)));
    return { id: service.id, name: service.name, href: SERVICIOS_HREF };
  },
  audit: (input, result) => ({
    entityType: "Service",
    entityId: (result as { id?: string } | null)?.id ?? input.servicioId,
  }),
  revalidate: () => catalogRoutes(),
});

const archivarServicio = defineTool({
  name: "archivar_servicio",
  title: "Archivar servicio del catálogo",
  description:
    "Archiva un servicio: deja de ofrecerse en cotizaciones y paquetes nuevos, pero no se borra y lo ya vendido no cambia. Desde aquí no hay forma de reactivarlo. Solo dueños y administradores. Pide confirmación a la persona antes de usarla.",
  kind: "destructive",
  permission: "catalog.manage",
  inputSchema: z.object({ servicioId }),
  async run(ctx, { servicioId: id }) {
    const service = await orNotFound(() => catalog.archiveService(ctx, id));
    return { id: service.id, name: service.name, isActive: service.isActive, href: SERVICIOS_HREF };
  },
  audit: (input, result) => ({
    entityType: "Service",
    entityId: (result as { id?: string } | null)?.id ?? input.servicioId,
  }),
  revalidate: () => catalogRoutes(),
});

const crearPaquete = defineTool({
  name: "crear_paquete",
  title: "Crear paquete de servicios",
  description:
    "Crea un paquete que agrupa servicios activos del catálogo con cantidades y un precio propio. Solo dueños y administradores.",
  kind: "write",
  permission: "catalog.manage",
  inputSchema: z.object({
    name: packageSchema.shape.name.describe(nombreDesc),
    description: packageSchema.shape.description.describe(descripcionDesc),
    defaultPrice: packageSchema.shape.defaultPrice.describe(precioDesc),
    currency: packageSchema.shape.currency.describe(monedaDesc),
    items: packageSchema.shape.items.describe(itemsDesc),
  }),
  async run(ctx, input) {
    const pkg = await orNotFound(() => catalog.createPackage(ctx, packageSchema.parse(input)));
    return { id: pkg.id, name: pkg.name, href: PAQUETES_HREF };
  },
  audit: (_input, result) => ({ entityType: "ServicePackage", entityId: (result as { id: string }).id }),
  revalidate: () => catalogRoutes(),
});

const editarPaquete = defineTool({
  name: "editar_paquete",
  title: "Editar paquete de servicios",
  description:
    "Cambia el nombre, la descripción, el precio, la moneda o los servicios de un paquete; solo se cambia lo que se envía. Si envías `items`, la lista de servicios se reemplaza por completo. Solo dueños y administradores.",
  kind: "write",
  permission: "catalog.manage",
  inputSchema: z.object({
    paqueteId,
    name: packageUpdateSchema.shape.name.describe(nombreDesc),
    description: packageUpdateSchema.shape.description.describe(descripcionDesc),
    defaultPrice: packageUpdateSchema.shape.defaultPrice.describe(precioDesc),
    currency: packageUpdateSchema.shape.currency.describe(monedaDesc),
    items: packageUpdateSchema.shape.items.describe(itemsDesc),
  }),
  async run(ctx, { paqueteId: id, ...rest }) {
    const pkg = await orNotFound(() => catalog.updatePackage(ctx, id, packageUpdateSchema.parse(rest)));
    return { id: pkg.id, name: pkg.name, href: PAQUETES_HREF };
  },
  audit: (input, result) => ({
    entityType: "ServicePackage",
    entityId: (result as { id?: string } | null)?.id ?? input.paqueteId,
  }),
  revalidate: () => catalogRoutes(),
});

const archivarPaquete = defineTool({
  name: "archivar_paquete",
  title: "Archivar paquete de servicios",
  description:
    "Archiva un paquete: deja de ofrecerse en cotizaciones nuevas, pero no se borra y lo ya vendido no cambia. Desde aquí no hay forma de reactivarlo. Solo dueños y administradores. Pide confirmación a la persona antes de usarla.",
  kind: "destructive",
  permission: "catalog.manage",
  inputSchema: z.object({ paqueteId }),
  async run(ctx, { paqueteId: id }) {
    const pkg = await orNotFound(() => catalog.archivePackage(ctx, id));
    return { id: pkg.id, name: pkg.name, isActive: pkg.isActive, href: PAQUETES_HREF };
  },
  audit: (input, result) => ({
    entityType: "ServicePackage",
    entityId: (result as { id?: string } | null)?.id ?? input.paqueteId,
  }),
  revalidate: () => catalogRoutes(),
});

/** Herramientas de escritura del catálogo: servicios y paquetes. */
export const catalogTools: Tool[] = [
  crearServicio,
  editarServicio,
  archivarServicio,
  crearPaquete,
  editarPaquete,
  archivarPaquete,
] as Tool[];
