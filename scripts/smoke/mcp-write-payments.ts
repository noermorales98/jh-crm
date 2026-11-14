/**
 * Herramientas de escritura de pagos, recibos y planes de pago del conector MCP contra una
 * base real y desechable. Cancelar, reembolsar y anular nunca borran (AC-7).
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-payments.ts
 */
import { PrismaClient } from "@prisma/client";
import { assertDisposableDb, errorName, meta, seedMcpOrg } from "./_lib/mcp-seed";

async function errorText(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
}

assertDisposableDb();
process.env.FEATURE_MCP_CONNECTOR = "true";

const prisma = new PrismaClient();
const MARK = `mcppay${Date.now()}`;
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function main() {
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const { paymentsTools } = await import("../../src/server/mcp/tools/payments");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: paymentsTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;
  const auditOf = (name: string, entityId: string) =>
    prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
  const payments = () => prisma.payment.count({ where: { organizationId: a.org.id } });
  const refreshesPayments = () => ["/crm/pagos", "/crm/recibos", "/crm/cotizaciones", "/crm/dashboard"].every((p) => calls.some((c) => c.path === p));

  try {
    console.log("metadatos");
    const byName = (n: string) => paymentsTools.find((t) => t.name === n)!;
    check("9 herramientas", paymentsTools.length === 9, paymentsTools.map((t) => t.name));
    for (const n of ["cancelar_pago", "marcar_pago_reembolsado", "anular_recibo", "cancelar_plan_pago", "enviar_enlace_pago_whatsapp"]) {
      check(`${n} es destructive y pide confirmación`, byName(n).kind === "destructive" && /confirm/i.test(byName(n).description), byName(n).description);
      check(`${n} no promete deshacer`, !/deshac|revert|reabr|recuper|restaur/i.test(byName(n).description));
    }
    check("marcar_pago_reembolsado aclara que no devuelve dinero", /no devuelve dinero/i.test(byName("marcar_pago_reembolsado").description));
    check("registrar_pago aclara que no cobra", /no cobra/i.test(byName("registrar_pago").description));
    check("crear_enlace_pago_cotizacion: mundo abierto, no cobra ni escribe al cliente",
      byName("crear_enlace_pago_cotizacion").openWorld === true && byName("crear_enlace_pago_cotizacion").kind === "write" && /no cobra/i.test(byName("crear_enlace_pago_cotizacion").description));
    check("enviar_enlace_pago_whatsapp: mundo abierto y avisa del servicio externo",
      byName("enviar_enlace_pago_whatsapp").openWorld === true && /externo/i.test(byName("enviar_enlace_pago_whatsapp").description));

    console.log("registrar_pago");
    const n0 = await payments();
    check("VIEWER -> Sin permiso y no escribe",
      (await errorText(() => call(a.viewer, "registrar_pago", { clientId: a.client.id, amount: 10, method: "CASH" }))).includes("Sin permiso") && (await payments()) === n0);
    calls.length = 0;
    const pending = await call(a.staff, "registrar_pago", { clientId: a.client.id, amount: 80, method: "ZELLE", status: "PENDING", dueAt: "2026-12-15", notes: ` nota ${MARK} ` });
    const pRow = await prisma.payment.findUnique({ where: { id: String(pending.id) } });
    check("STAFF registra un pago pendiente", pRow?.status === "PENDING" && pRow.amount.toString() === "80" && pRow.notes === `nota ${MARK}`, pRow);
    check("el vencimiento AAAA-MM-DD queda a mediodía en la zona de la organización", !!pRow?.dueAt && pRow.dueAt.getUTCDate() === 15 && pRow.dueAt.getUTCHours() >= 16 && pRow.dueAt.getUTCHours() <= 19, pRow?.dueAt);
    check("pendiente: sin recibo", pending.receiptId === null && String(pending.href).endsWith("/crm/pagos"), pending);
    const au = await auditOf("registrar_pago", String(pending.id));
    check("auditoría via claude y entidad Payment", !!au && au.entityType === "Payment" && meta(au.metadata).via === "claude", au);
    check("refresca pagos, recibos, cotizaciones y panel", refreshesPayments(), calls);
    const received = await call(a.staff, "registrar_pago", { clientId: a.client.id, amount: 120, method: "CASH", status: "RECEIVED", receivedAt: "2026-11-10" });
    const receipt = await prisma.receipt.findUnique({ where: { paymentId: String(received.id) } });
    check("recibido: el CRM emite el recibo", !!receipt && receipt.status === "ISSUED" && received.receiptId === receipt.id && received.receiptFolio === receipt.folio, { received, receipt });
    const nz = await payments();
    check("monto 0 -> error y no escribe", (await errorText(() => call(a.staff, "registrar_pago", { clientId: a.client.id, amount: 0, method: "CASH" }))) !== "ok" && (await payments()) === nz);
    const dflt = await call(a.staff, "registrar_pago", { clientId: a.client.id, amount: 5, method: "CASH" });
    check("sin estado: RECEIVED con recibo, igual que la app (y la descripción lo dice)",
      dflt.status === "RECEIVED" && !!dflt.receiptId && /por defecto/i.test(byName("registrar_pago").description) && /PENDING/.test(byName("registrar_pago").description), dflt);
    check("método inválido -> ZodError", (await errorName(() => call(a.staff, "registrar_pago", { clientId: a.client.id, amount: 5, method: "BITCOIN" }))) === "ZodError");
    const n1 = await payments();
    check("cliente de otra organización -> No encontrado y no escribe",
      (await errorText(() => call(a.staff, "registrar_pago", { clientId: b.client.id, amount: 5, method: "CASH" }))) === "NotFoundError: No encontrado." && (await payments()) === n1);

    console.log("editar_pago_pendiente");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "editar_pago_pendiente", { pagoId: String(pending.id), amount: 90 }))).includes("Sin permiso"));
    calls.length = 0;
    await call(a.staff, "editar_pago_pendiente", { pagoId: String(pending.id), amount: 95, reference: "ZL-1", notes: null });
    const edited = await prisma.payment.findUnique({ where: { id: String(pending.id) } });
    check("STAFF edita monto, referencia y borra notas", edited?.amount.toString() === "95" && edited.reference === "ZL-1" && edited.notes === null, edited);
    check("auditoría", !!(await auditOf("editar_pago_pendiente", String(pending.id))));
    check("refresca pagos", refreshesPayments(), calls);
    check("pago recibido no se edita -> DomainError y sin cambios",
      (await errorText(() => call(a.staff, "editar_pago_pendiente", { pagoId: String(received.id), amount: 1 }))).startsWith("DomainError") &&
        (await prisma.payment.findUnique({ where: { id: String(received.id) } }))?.amount.toString() === "120");
    const foreignPay = await prisma.payment.create({ data: { organizationId: b.org.id, clientId: b.client.id, amount: 7, method: "CASH" } });
    check("pago ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.staff, "editar_pago_pendiente", { pagoId: foreignPay.id, amount: 1 }))) === "NotFoundError: No encontrado." &&
        (await prisma.payment.findUnique({ where: { id: foreignPay.id } }))?.amount.toString() === "7");

    console.log("cancelar_pago (AC-7)");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "cancelar_pago", { pagoId: String(pending.id) }))).includes("Sin permiso"));
    const n2 = await payments();
    const cancelled = await call(a.staff, "cancelar_pago", { pagoId: String(pending.id), reason: "duplicado" });
    check("STAFF cancela: estado CANCELLED", cancelled.status === "CANCELLED", cancelled);
    check("el pago sigue existiendo (borrado lógico)", (await payments()) === n2 && (await prisma.payment.findUnique({ where: { id: String(pending.id) } }))?.status === "CANCELLED");
    check("auditoría", !!(await auditOf("cancelar_pago", String(pending.id))));
    check("pago recibido no se cancela -> DomainError", (await errorText(() => call(a.staff, "cancelar_pago", { pagoId: String(received.id) }))).startsWith("DomainError"));
    check("pago ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.staff, "cancelar_pago", { pagoId: foreignPay.id }))) === "NotFoundError: No encontrado." &&
        (await prisma.payment.findUnique({ where: { id: foreignPay.id } }))?.status === "PENDING");

    console.log("marcar_pago_reembolsado (AC-7)");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "marcar_pago_reembolsado", { pagoId: String(received.id) }))).includes("Sin permiso"));
    const refunded = await call(a.staff, "marcar_pago_reembolsado", { pagoId: String(received.id), reason: "devuelto en efectivo" });
    const rPay = await prisma.payment.findUnique({ where: { id: String(received.id) } });
    const rRec = await prisma.receipt.findUnique({ where: { paymentId: String(received.id) } });
    check("STAFF lo marca: pago REFUNDED y recibo VOID, ambos siguen existiendo", refunded.status === "REFUNDED" && rPay?.status === "REFUNDED" && rRec?.status === "VOID", { rPay, rRec });
    check("auditoría", !!(await auditOf("marcar_pago_reembolsado", String(received.id))));
    check("pago no recibido -> DomainError", (await errorText(() => call(a.staff, "marcar_pago_reembolsado", { pagoId: String(pending.id) }))).startsWith("DomainError"));

    console.log("anular_recibo (solo OWNER/ADMIN, AC-7)");
    const another = await call(a.staff, "registrar_pago", { clientId: a.client.id, amount: 60, method: "CASH", status: "RECEIVED" });
    const reciboId = String(another.receiptId);
    check("STAFF -> Sin permiso (igual que la app)", (await errorText(() => call(a.staff, "anular_recibo", { reciboId, voidReason: "error de captura" }))).includes("Sin permiso"));
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "anular_recibo", { reciboId, voidReason: "error de captura" }))).includes("Sin permiso"));
    check("motivo corto -> ZodError", (await errorName(() => call(a.owner, "anular_recibo", { reciboId, voidReason: "x" }))) === "ZodError");
    calls.length = 0;
    const voided = await call(a.owner, "anular_recibo", { reciboId, voidReason: "error de captura" });
    const vRow = await prisma.receipt.findUnique({ where: { id: reciboId } });
    check("OWNER anula: VOID con motivo, el recibo sigue existiendo", voided.status === "VOID" && vRow?.status === "VOID" && vRow.voidReason === "error de captura", vRow);
    const au2 = await auditOf("anular_recibo", reciboId);
    check("auditoría con entidad Receipt", !!au2 && au2.entityType === "Receipt" && meta(au2.metadata).via === "claude", au2);
    check("refresca recibos y pagos", calls.some((c) => c.path === "/crm/recibos") && calls.some((c) => c.path === "/crm/pagos"), calls);
    check("recibo ya anulado -> DomainError", (await errorText(() => call(a.owner, "anular_recibo", { reciboId, voidReason: "otra vez" }))).startsWith("DomainError"));
    const bPay = await prisma.payment.create({ data: { organizationId: b.org.id, clientId: b.client.id, amount: 9, method: "CASH", status: "RECEIVED" } });
    const bRec = await prisma.receipt.create({ data: { organizationId: b.org.id, paymentId: bPay.id, clientId: b.client.id, folioNumber: 1, folio: `RB-${MARK}`.slice(0, 40), amount: 9, paymentMethod: "CASH" } });
    check("recibo ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.owner, "anular_recibo", { reciboId: bRec.id, voidReason: "ajeno" }))) === "NotFoundError: No encontrado." &&
        (await prisma.receipt.findUnique({ where: { id: bRec.id } }))?.status === "ISSUED");

    console.log("crear_plan_pago");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "crear_plan_pago", { clientId: a.client.id, totalAmount: 300, numberOfInstallments: 3, frequency: "MONTHLY", startDate: "2026-12-01" }))).includes("Sin permiso"));
    calls.length = 0;
    const plan = await call(a.staff, "crear_plan_pago", { clientId: a.client.id, totalAmount: 300, numberOfInstallments: 3, frequency: "MONTHLY", startDate: "2026-12-01", notes: "" });
    const planRow = await prisma.paymentPlan.findUnique({ where: { id: String(plan.id) }, include: { installments: true } });
    check("STAFF crea el plan con 3 cuotas pendientes", planRow?.status === "ACTIVE" && planRow.installments.length === 3 && planRow.installments.every((i) => i.status === "PENDING") && planRow.notes === null, planRow);
    check("enlace al plan", String(plan.href).endsWith(`/crm/planes-pago/${plan.id}`), plan);
    const au3 = await auditOf("crear_plan_pago", String(plan.id));
    check("auditoría con entidad PaymentPlan", !!au3 && au3.entityType === "PaymentPlan" && meta(au3.metadata).via === "claude", au3);
    check("refresca planes, el plan, pagos y el cliente",
      ["/crm/planes-pago", `/crm/planes-pago/${plan.id}`, "/crm/pagos", `/crm/clientes/${a.client.id}`].every((p) => calls.some((c) => c.path === p)), calls);
    check("1 cuota -> ZodError", (await errorName(() => call(a.staff, "crear_plan_pago", { clientId: a.client.id, totalAmount: 300, numberOfInstallments: 1, frequency: "MONTHLY", startDate: "2026-12-01" }))) === "ZodError");
    check("sin fecha de inicio -> ZodError", (await errorName(() => call(a.staff, "crear_plan_pago", { clientId: a.client.id, totalAmount: 300, numberOfInstallments: 3, frequency: "MONTHLY" }))) === "ZodError");
    const plans = () => prisma.paymentPlan.count({ where: { organizationId: a.org.id } });
    const pl0 = await plans();
    check("cliente ajeno -> No encontrado y no crea",
      (await errorText(() => call(a.staff, "crear_plan_pago", { clientId: b.client.id, totalAmount: 300, numberOfInstallments: 3, frequency: "MONTHLY", startDate: "2026-12-01" }))) === "NotFoundError: No encontrado." && (await plans()) === pl0);

    console.log("cancelar_plan_pago (AC-7)");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "cancelar_plan_pago", { planId: String(plan.id) }))).includes("Sin permiso"));
    const cp = await call(a.staff, "cancelar_plan_pago", { planId: String(plan.id), reason: "cliente cambió de plan" });
    const cpRow = await prisma.paymentPlan.findUnique({ where: { id: String(plan.id) }, include: { installments: true } });
    check("STAFF cancela: plan CANCELLED, cuotas CANCELLED, todo sigue existiendo",
      cp.status === "CANCELLED" && cpRow?.status === "CANCELLED" && cpRow.installments.length === 3 && cpRow.installments.every((i) => i.status === "CANCELLED"), cpRow);
    check("auditoría", !!(await auditOf("cancelar_plan_pago", String(plan.id))));
    check("plan ya cancelado -> DomainError", (await errorText(() => call(a.staff, "cancelar_plan_pago", { planId: String(plan.id) }))).startsWith("DomainError"));
    const bPlan = await prisma.paymentPlan.create({ data: { organizationId: b.org.id, clientId: b.client.id, totalAmount: 200, installmentAmount: 100, frequency: "MONTHLY", numberOfInstallments: 2, startDate: new Date() } });
    check("plan ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.staff, "cancelar_plan_pago", { planId: bPlan.id }))) === "NotFoundError: No encontrado." &&
        (await prisma.paymentPlan.findUnique({ where: { id: bPlan.id } }))?.status === "ACTIVE");

    console.log("enlaces de pago (sin llegar a Stripe ni a WhatsApp)");
    const draftQuote = await prisma.quote.create({ data: { organizationId: a.org.id, clientId: a.client.id, folioNumber: 1, folio: `Q-${MARK}`.slice(0, 40), status: "DRAFT", total: 100 } });
    const bQuote = await prisma.quote.create({ data: { organizationId: b.org.id, clientId: b.client.id, folioNumber: 1, folio: `QB-${MARK}`.slice(0, 40), status: "SENT", total: 100 } });
    for (const n of ["crear_enlace_pago_cotizacion", "enviar_enlace_pago_whatsapp"]) {
      check(`${n}: VIEWER -> Sin permiso`, (await errorText(() => call(a.viewer, n, { cotizacionId: draftQuote.id }))).includes("Sin permiso"));
      check(`${n}: cotización ajena -> No encontrado`, (await errorText(() => call(a.staff, n, { cotizacionId: bQuote.id }))) === "NotFoundError: No encontrado.");
      check(`${n}: id vacío -> ZodError`, (await errorName(() => call(a.staff, n, { cotizacionId: "" }))) === "ZodError");
    }
    check("crear_enlace_pago_cotizacion: cotización en borrador -> DomainError antes de Stripe",
      (await errorText(() => call(a.staff, "crear_enlace_pago_cotizacion", { cotizacionId: draftQuote.id }))).startsWith("DomainError: Solo se puede generar"));
    await prisma.client.update({ where: { id: a.client.id }, data: { phone: null } });
    check("enviar_enlace_pago_whatsapp: cliente sin teléfono -> DomainError antes de WhatsApp",
      (await errorText(() => call(a.staff, "enviar_enlace_pago_whatsapp", { cotizacionId: draftQuote.id }))).startsWith("DomainError: El cliente no tiene teléfono"));
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-payments: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
