import { z } from "zod";
import { cuidSchema } from "@/src/lib/validation/common";
import { DomainError, NotFoundError } from "@/src/server/errors";
import * as testimonials from "@/src/server/testimonials";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de testimonios. Cada herramienta replica su action de `src/actions/testimonials.ts`
 * (`testimonials.manage`, mismos esquemas y mismo servicio).
 *
 * Fuera a propósito: registrar el consentimiento, aprobar o rechazar y publicar. El
 * consentimiento es del cliente (con evidencia) y la aprobación y la publicación exigen una
 * decisión humana en el CRM: Claude prepara el texto, la persona decide qué sale al sitio.
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

const TESTIMONIOS_HREF = "/crm/testimonios";

/** Igual que `refresh` de la action. */
function testimonialRoutes(clientId: string): RevalidateTarget[] {
  return [
    TESTIMONIOS_HREF,
    `/crm/clientes/${clientId}/testimonios`,
    `/crm/clientes/${clientId}/actividad`,
    "/portal/testimonios",
  ];
}

// Mismo esquema que `src/actions/testimonials.ts` (allí no se exporta).
const inputSchema = z.object({
  clientId: cuidSchema,
  serviceCaseId: cuidSchema.nullish(),
  displayName: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(5000),
  rating: z.number().int().min(1).max(5).nullish(),
});

const testimonioId = cuidSchema.describe("Identificador del testimonio (se obtiene con `listar` en la sección testimonios).");
const actualizadoEn = z.coerce
  .date()
  .describe("Fecha `updatedAt` del testimonio tal como la devolvió `ver`; si alguien lo cambió mientras tanto, la herramienta falla y hay que volver a leerlo.");
const nombreDesc = "Nombre con el que se mostraría públicamente (de 1 a 120 caracteres).";
const textoDesc = "Texto del testimonio (de 1 a 5000 caracteres).";
const calificacionDesc = "Calificación de 1 a 5; null la quita.";
const casoDesc = "Identificador del expediente del cliente al que se refiere (opcional).";

const auditTestimonial = (input: object, result: unknown) => ({
  entityType: "Testimonial",
  entityId: (result as { id?: string } | null)?.id ?? (input as { testimonioId?: string }).testimonioId ?? null,
});

const crearTestimonio = defineTool({
  name: "crear_testimonio",
  title: "Crear testimonio",
  description:
    "Guarda un testimonio de un cliente en estado pendiente. No lo publica ni registra el consentimiento del cliente: esos pasos los hace una persona en el CRM.",
  kind: "write",
  permission: "testimonials.manage",
  inputSchema: z.object({
    clientId: inputSchema.shape.clientId.describe("Identificador del cliente."),
    serviceCaseId: inputSchema.shape.serviceCaseId.describe(casoDesc),
    displayName: inputSchema.shape.displayName.describe(nombreDesc),
    body: inputSchema.shape.body.describe(textoDesc),
    rating: inputSchema.shape.rating.describe(calificacionDesc),
  }),
  async run(ctx, input) {
    const row = await orNotFound(() => testimonials.createTestimonial(ctx, inputSchema.parse(input)));
    return { id: row.id, status: row.status, clientId: row.clientId, href: TESTIMONIOS_HREF };
  },
  audit: auditTestimonial,
  revalidate: (result) => testimonialRoutes((result as { clientId: string }).clientId),
});

const editarTestimonio = defineTool({
  name: "editar_testimonio",
  title: "Editar testimonio",
  description:
    "Cambia el nombre, el texto o la calificación de un testimonio. Al editarlo vuelve a estado pendiente, se retira de publicación y se revoca el consentimiento que tuviera: una persona tendrá que revisarlo y registrar el consentimiento de nuevo. Pide confirmación a la persona antes de usarla en un testimonio ya aprobado o publicado.",
  kind: "write",
  permission: "testimonials.manage",
  inputSchema: z.object({
    testimonioId,
    actualizadoEn,
    clientId: inputSchema.shape.clientId.describe("Identificador del cliente del testimonio (no se puede cambiar)."),
    serviceCaseId: inputSchema.shape.serviceCaseId.describe(casoDesc),
    displayName: inputSchema.shape.displayName.describe(nombreDesc),
    body: inputSchema.shape.body.describe(textoDesc),
    rating: inputSchema.shape.rating.describe(calificacionDesc),
  }),
  async run(ctx, { testimonioId: id, actualizadoEn: updatedAt, ...rest }) {
    const row = await orNotFound(() =>
      testimonials.changeTestimonial(ctx, id, updatedAt, { kind: "edit", data: inputSchema.parse(rest) }),
    );
    return { id: row.id, status: row.status, clientId: row.clientId, updatedAt: row.updatedAt, href: TESTIMONIOS_HREF };
  },
  audit: auditTestimonial,
  revalidate: (result) => testimonialRoutes((result as { clientId: string }).clientId),
});

const eliminarTestimonio = defineTool({
  name: "eliminar_testimonio",
  title: "Eliminar testimonio",
  description:
    "Quita un testimonio de las listas y del sitio público. Es un borrado lógico: el registro se conserva en la base de datos, pero desde aquí no hay forma de recuperarlo. Pide confirmación a la persona antes de usarla.",
  kind: "destructive",
  permission: "testimonials.manage",
  inputSchema: z.object({ testimonioId, actualizadoEn }),
  async run(ctx, { testimonioId: id, actualizadoEn: updatedAt }) {
    const row = await orNotFound(() => testimonials.changeTestimonial(ctx, id, updatedAt, { kind: "delete" }));
    return { id: row.id, clientId: row.clientId, deleted: true, href: TESTIMONIOS_HREF };
  },
  audit: auditTestimonial,
  revalidate: (result) => testimonialRoutes((result as { clientId: string }).clientId),
});

/** Herramientas de escritura de testimonios. */
export const testimonialsTools: Tool[] = [crearTestimonio, editarTestimonio, eliminarTestimonio] as Tool[];
