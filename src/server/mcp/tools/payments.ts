import { z } from "zod";
import {
  cuidSchema,
  moneySchema,
  orgDateInputSchema,
  requiredOrgDateInputSchema,
  resolveOrgDateInput,
} from "@/src/lib/validation/common";
import { PAYMENT_PLAN_FREQUENCIES } from "@/src/lib/validation/payment-plans";
import { DomainError, NotFoundError } from "@/src/server/errors";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import * as paymentService from "@/src/server/payments";
import * as paymentPlans from "@/src/server/payment-plans";
import * as receiptService from "@/src/server/receipts";
import { defineTool, type RevalidateTarget, type Tool } from "./types";

/**
 * Escritura de pagos, recibos y planes de pago. Cada herramienta replica su action de
 * `src/actions/payments.ts`, `receipts.ts` y `payment-plans.ts`: mismo permiso, mismo
 * esquema, misma resolución de fechas en la zona de la organización y mismo servicio.
 * Ninguna mueve dinero: registran en el CRM lo que ya pasó. El enlace de Stripe solo crea
 * la página de pago; el cobro lo hace el cliente.
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

const PAGOS_HREF = "/crm/pagos";
const RECIBOS_HREF = "/crm/recibos";
const PLANES_HREF = "/crm/planes-pago";

/** Igual que `revalidatePayments` de la action. */
function paymentRoutes(): RevalidateTarget[] {
  return [PAGOS_HREF, RECIBOS_HREF, "/crm/cotizaciones", "/crm/dashboard"];
}

/** Igual que `revalidatePlans` de la action. */
function planRoutes(planId?: string | null, clientId?: string | null): RevalidateTarget[] {
  const routes: RevalidateTarget[] = [PLANES_HREF, PAGOS_HREF];
  if (planId) routes.push(`${PLANES_HREF}/${planId}`);
  if (clientId) routes.push(`/crm/clientes/${clientId}`);
  return routes;
}

// Mismos esquemas que `src/actions/payments.ts` (allí no se exportan).
const methodEnum = z.enum(["ZELLE", "STRIPE", "CASH", "BANK_TRANSFER", "OTHER"]);
const registerSchema = z.object({
  clientId: cuidSchema,
  caseId: cuidSchema.nullish(),
  quoteId: cuidSchema.nullish(),
  amount: moneySchema,
  method: methodEnum,
  status: z.enum(["PENDING", "RECEIVED"]).optional(),
  reference: z.string().trim().max(200).nullish(),
  dueAt: orgDateInputSchema,
  receivedAt: orgDateInputSchema,
  notes: z.string().trim().max(5000).nullish(),
});
const updatePendingSchema = z.object({
  amount: moneySchema.optional(),
  method: methodEnum.optional(),
  reference: z.string().trim().max(200).nullish(),
  dueAt: orgDateInputSchema,
  notes: z.string().trim().max(5000).nullish(),
});
const reasonSchema = z.string().trim().max(1000).optional();
const voidReasonSchema = z.string().trim().min(3, "Indica el motivo de la anulación.").max(1000);

const pagoId = cuidSchema.describe("Identificador del pago (se obtiene con `listar` o `ver` en la sección pagos).");
const cotizacionId = cuidSchema.describe("Identificador de la cotización (se obtiene con `listar` en la sección cotizaciones).");
const metodoDesc = "Método de pago: ZELLE, STRIPE, CASH, BANK_TRANSFER u OTHER.";
const referenciaDesc = "Referencia del pago (folio de Zelle, transferencia…), máximo 200 caracteres. Nunca un número de cuenta o tarjeta completo.";
const fechaDesc = (que: string) =>
  `${que} como AAAA-MM-DD (se interpreta a las 12:00 en la zona horaria de la organización) o instante completo.`;

const auditPayment = (input: object, result: unknown) => ({
  entityType: "Payment",
  entityId: (result as { id?: string } | null)?.id ?? (input as { pagoId?: string }).pagoId ?? null,
});

const registrarPago = defineTool({
  name: "registrar_pago",
  title: "Registrar pago",
  description:
    "Registra en el CRM un pago de un cliente, ya recibido (por defecto) o pendiente. Si es recibido, el CRM emite el recibo y actualiza el saldo de la cotización. No cobra nada: solo deja constancia de un pago que la persona confirma; si no está claro que el dinero ya llegó, pregunta o usa PENDING.",
  kind: "write",
  permission: "payments.register",
  inputSchema: z.object({
    clientId: registerSchema.shape.clientId.describe("Identificador del cliente que paga."),
    caseId: registerSchema.shape.caseId.describe("Identificador del caso de crédito al que se asigna (opcional)."),
    quoteId: registerSchema.shape.quoteId.describe("Identificador de la cotización que se abona (opcional)."),
    amount: registerSchema.shape.amount.describe("Monto en USD, mayor que 0."),
    method: registerSchema.shape.method.describe(metodoDesc),
    status: registerSchema.shape.status.describe("RECEIVED (ya recibido: emite recibo) o PENDING (por cobrar). Si se omite, el CRM lo registra como RECEIVED, igual que en la app: indica PENDING si el pago aún no llega."),
    reference: registerSchema.shape.reference.describe(referenciaDesc),
    dueAt: registerSchema.shape.dueAt.describe(fechaDesc("Fecha de vencimiento de un pago pendiente")),
    receivedAt: registerSchema.shape.receivedAt.describe(fechaDesc("Fecha en que se recibió el pago")),
    notes: registerSchema.shape.notes.describe("Notas internas del pago (máximo 5000 caracteres)."),
  }),
  async run(ctx, input) {
    const data = registerSchema.parse(input);
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const result = await orNotFound(() =>
      paymentService.registerPayment(ctx, {
        ...data,
        dueAt: resolveOrgDateInput(data.dueAt, tz, 12),
        receivedAt: resolveOrgDateInput(data.receivedAt, tz, 12),
      }),
    );
    return {
      id: result.payment.id,
      status: result.payment.status,
      receiptId: result.receipt?.id ?? null,
      receiptFolio: result.receipt?.folio ?? null,
      quoteStatus: result.quoteStatus ?? null,
      href: PAGOS_HREF,
    };
  },
  audit: auditPayment,
  revalidate: () => paymentRoutes(),
});

const editarPagoPendiente = defineTool({
  name: "editar_pago_pendiente",
  title: "Editar pago pendiente",
  description:
    "Cambia el monto, método, referencia, vencimiento o notas de un pago que sigue pendiente. No sirve para pagos recibidos, cancelados o reembolsados.",
  kind: "write",
  permission: "payments.register",
  inputSchema: z.object({
    pagoId,
    amount: updatePendingSchema.shape.amount.describe("Nuevo monto en USD, mayor que 0."),
    method: updatePendingSchema.shape.method.describe(metodoDesc),
    reference: updatePendingSchema.shape.reference.describe(referenciaDesc),
    dueAt: updatePendingSchema.shape.dueAt.describe(fechaDesc("Nueva fecha de vencimiento")),
    notes: updatePendingSchema.shape.notes.describe("Notas internas del pago; null las borra."),
  }),
  async run(ctx, { pagoId: id, ...rest }) {
    const data = updatePendingSchema.parse(rest);
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const payment = await orNotFound(() =>
      paymentService.updatePendingPayment(ctx, id, { ...data, dueAt: resolveOrgDateInput(data.dueAt, tz, 12) }),
    );
    return { id: payment.id, status: payment.status, href: PAGOS_HREF };
  },
  audit: auditPayment,
  revalidate: () => paymentRoutes(),
});

const cancelarPago = defineTool({
  name: "cancelar_pago",
  title: "Cancelar pago pendiente",
  description:
    "Cancela un pago pendiente: queda en estado CANCELLED y no se borra. Para un pago ya recibido usa `marcar_pago_reembolsado`. Pide confirmación a la persona antes de usarla.",
  kind: "destructive",
  permission: "payments.register",
  inputSchema: z.object({
    pagoId,
    reason: reasonSchema.describe("Motivo de la cancelación (opcional, máximo 1000 caracteres)."),
  }),
  async run(ctx, { pagoId: id, reason }) {
    const payment = await orNotFound(() => paymentService.cancelPayment(ctx, id, reason));
    return { id: payment.id, status: payment.status, href: PAGOS_HREF };
  },
  audit: auditPayment,
  revalidate: () => paymentRoutes(),
});

const marcarPagoReembolsado = defineTool({
  name: "marcar_pago_reembolsado",
  title: "Marcar pago como reembolsado",
  description:
    "Marca un pago recibido como reembolsado y anula su recibo. Solo deja constancia en el CRM: no devuelve dinero por Stripe ni por ningún otro medio; el reembolso real lo hace la persona. El pago no se borra. Pide confirmación antes de usarla.",
  kind: "destructive",
  permission: "payments.register",
  inputSchema: z.object({
    pagoId,
    reason: reasonSchema.describe("Motivo del reembolso (opcional, máximo 1000 caracteres)."),
  }),
  async run(ctx, { pagoId: id, reason }) {
    const payment = await orNotFound(() => paymentService.refundPaymentRecord(ctx, id, reason));
    return { id: payment.id, status: payment.status, href: PAGOS_HREF };
  },
  audit: auditPayment,
  revalidate: () => paymentRoutes(),
});

const crearEnlacePagoCotizacion = defineTool({
  name: "crear_enlace_pago_cotizacion",
  title: "Crear enlace de pago de una cotización",
  description:
    "Crea en Stripe (servicio externo) la página de pago del saldo de una cotización y devuelve su dirección para compartirla. No cobra nada ni escribe al cliente: el cobro solo ocurre si el cliente paga en esa página.",
  kind: "write",
  openWorld: true,
  permission: "payments.register",
  inputSchema: z.object({ cotizacionId }),
  async run(ctx, { cotizacionId: id }) {
    const { startQuoteCheckout } = await import("@/src/server/payments/stripe");
    const result = await orNotFound(() => startQuoteCheckout(ctx, id));
    return { quoteId: id, url: result.url, href: `/crm/cotizaciones/${id}` };
  },
  audit: (input) => ({ entityType: "Quote", entityId: input.cotizacionId }),
  revalidate: (_result, input) => [...paymentRoutes(), `/crm/cotizaciones/${input.cotizacionId}`],
});

const enviarEnlacePagoWhatsapp = defineTool({
  name: "enviar_enlace_pago_whatsapp",
  title: "Enviar enlace de pago por WhatsApp",
  description:
    "Crea el enlace de pago de Stripe de una cotización y se lo manda al cliente por WhatsApp, a través de un servicio externo. El mensaje sale de verdad y no se puede retirar: confirma con la persona antes de usarla.",
  kind: "destructive",
  openWorld: true,
  permission: "payments.register",
  inputSchema: z.object({ cotizacionId }),
  async run(ctx, { cotizacionId: id }) {
    const { sendQuoteCheckoutWhatsapp } = await import("@/src/server/payments/stripe");
    const result = await orNotFound(() => sendQuoteCheckoutWhatsapp(ctx, id));
    // El teléfono del cliente no vuelve a Claude: basta con saber que salió.
    return { quoteId: id, url: result.url, sent: true, href: `/crm/cotizaciones/${id}` };
  },
  audit: (input) => ({ entityType: "Quote", entityId: input.cotizacionId }),
  revalidate: (_result, input) => [...paymentRoutes(), `/crm/cotizaciones/${input.cotizacionId}`],
});

const anularRecibo = defineTool({
  name: "anular_recibo",
  title: "Anular recibo",
  description:
    "Anula un recibo emitido con un motivo: queda en estado VOID y no se borra. Solo dueños y administradores. Pide confirmación a la persona antes de usarla.",
  kind: "destructive",
  permission: "receipts.void",
  inputSchema: z.object({
    reciboId: cuidSchema.describe("Identificador del recibo (se obtiene con `listar` en la sección recibos)."),
    voidReason: voidReasonSchema.describe("Motivo de la anulación (de 3 a 1000 caracteres)."),
  }),
  async run(ctx, { reciboId, voidReason }) {
    const receipt = await orNotFound(() => receiptService.voidReceipt(ctx, reciboId, voidReason));
    return { id: receipt.id, folio: receipt.folio, status: receipt.status, href: RECIBOS_HREF };
  },
  audit: (input, result) => ({
    entityType: "Receipt",
    entityId: (result as { id?: string } | null)?.id ?? input.reciboId,
  }),
  revalidate: () => [RECIBOS_HREF, PAGOS_HREF],
});

// Mismo esquema que `src/lib/validation/payment-plans.ts`.
const createPlanShape = {
  clientId: cuidSchema,
  caseId: cuidSchema.optional().nullable(),
  quoteId: cuidSchema.optional().nullable(),
  totalAmount: moneySchema,
  numberOfInstallments: z.number().int().min(2, "Mínimo 2 cuotas.").max(60, "Máximo 60 cuotas."),
  frequency: z.enum(PAYMENT_PLAN_FREQUENCIES),
  startDate: requiredOrgDateInputSchema("Indica la fecha de inicio."),
  notes: z.string().trim().max(5000).nullish().or(z.literal("")),
};

const crearPlanPago = defineTool({
  name: "crear_plan_pago",
  title: "Crear plan de pago",
  description:
    "Crea un plan de pago en cuotas para un cliente (de 2 a 60 cuotas, semanal, quincenal, mensual o personalizado), con las cuotas calculadas por el CRM. No cobra nada: las cuotas quedan pendientes.",
  kind: "write",
  permission: "payments.register",
  inputSchema: z.object({
    clientId: createPlanShape.clientId.describe("Identificador del cliente."),
    caseId: createPlanShape.caseId.describe("Identificador del caso de crédito (opcional)."),
    quoteId: createPlanShape.quoteId.describe("Identificador de la cotización que se financia (opcional)."),
    totalAmount: createPlanShape.totalAmount.describe("Monto total del plan en USD."),
    numberOfInstallments: createPlanShape.numberOfInstallments.describe("Número de cuotas (de 2 a 60)."),
    frequency: createPlanShape.frequency.describe("Frecuencia: WEEKLY, BIWEEKLY, MONTHLY o CUSTOM."),
    startDate: createPlanShape.startDate.describe(fechaDesc("Fecha de la primera cuota (obligatoria)")),
    notes: createPlanShape.notes.describe("Notas del plan (máximo 5000 caracteres)."),
  }),
  async run(ctx, data) {
    const tz = await getOrganizationTimezone(ctx.organizationId);
    const plan = await orNotFound(() =>
      paymentPlans.createPaymentPlan(ctx, {
        ...data,
        startDate: resolveOrgDateInput(data.startDate, tz, 12),
        notes: data.notes || null,
      }),
    );
    return { id: plan.id, status: plan.status, clientId: plan.clientId, href: `${PLANES_HREF}/${plan.id}` };
  },
  audit: (_input, result) => ({ entityType: "PaymentPlan", entityId: (result as { id: string }).id }),
  revalidate: (result) => {
    const r = result as { id: string; clientId: string };
    return planRoutes(r.id, r.clientId);
  },
});

const cancelarPlanPago = defineTool({
  name: "cancelar_plan_pago",
  title: "Cancelar plan de pago",
  description:
    "Cancela un plan de pago activo o en pausa y sus cuotas pendientes: el plan queda en estado CANCELLED y no se borra; las cuotas ya pagadas se conservan. Pide confirmación a la persona antes de usarla.",
  kind: "destructive",
  permission: "payments.register",
  inputSchema: z.object({
    planId: cuidSchema.describe("Identificador del plan de pago (se obtiene con `listar` en la sección planes_pago)."),
    reason: reasonSchema.describe("Motivo de la cancelación (opcional, máximo 1000 caracteres)."),
  }),
  async run(ctx, { planId, reason }) {
    const plan = await orNotFound(() => paymentPlans.cancelPaymentPlan(ctx, planId, reason));
    return { id: plan.id, status: plan.status, clientId: plan.clientId, href: `${PLANES_HREF}/${plan.id}` };
  },
  audit: (input, result) => ({
    entityType: "PaymentPlan",
    entityId: (result as { id?: string } | null)?.id ?? input.planId,
  }),
  revalidate: (result) => {
    const r = result as { id: string; clientId: string };
    return planRoutes(r.id, r.clientId);
  },
});

/** Herramientas de escritura de pagos, recibos y planes de pago. */
export const paymentsTools: Tool[] = [
  registrarPago,
  editarPagoPendiente,
  cancelarPago,
  marcarPagoReembolsado,
  crearEnlacePagoCotizacion,
  enviarEnlacePagoWhatsapp,
  anularRecibo,
  crearPlanPago,
  cancelarPlanPago,
] as Tool[];
