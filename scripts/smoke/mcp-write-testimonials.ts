/**
 * Herramientas de escritura de testimonios del conector MCP contra una base real y desechable.
 * Claude crea, edita y elimina (borrado lógico); no registra consentimientos, no aprueba ni publica.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-testimonials.ts
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
const MARK = `mcptes${Date.now()}`;
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
  const { testimonialsTools } = await import("../../src/server/mcp/tools/testimonials");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: testimonialsTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.staff, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;
  const auditOk = async (name: string, entityId: string) => {
    const row = await prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    return !!row && row.entityType === "Testimonial" && meta(row.metadata).via === "claude";
  };
  const refreshes = () =>
    ["/crm/testimonios", `/crm/clientes/${a.client.id}/testimonios`, `/crm/clientes/${a.client.id}/actividad`, "/portal/testimonios"].every((p) => calls.some((c) => c.path === p));
  const count = () => prisma.testimonial.count({ where: { organizationId: a.org.id } });

  try {
    console.log("metadatos");
    check("3 herramientas con permiso testimonials.manage", testimonialsTools.length === 3 && testimonialsTools.every((t) => t.permission === "testimonials.manage"));
    const del = testimonialsTools.find((t) => t.name === "eliminar_testimonio")!;
    check("eliminar_testimonio es destructive, pide confirmación y no promete deshacer", del.kind === "destructive" && /confirm/i.test(del.description) && !/reabr|restaur|recuper(a|ar) /.test(del.description.replace(/no hay forma de recuperarlo/i, "")), del.description);
    check("editar_testimonio avisa de que revoca el consentimiento", /revoca el consentimiento/i.test(testimonialsTools.find((t) => t.name === "editar_testimonio")!.description));
    check("no hay herramientas de consentimiento, aprobación ni publicación", !testimonialsTools.some((t) => /consent|aprob|rechaz|public/.test(t.name)));

    console.log("crear_testimonio");
    const n0 = await count();
    const args = { clientId: a.client.id, displayName: `  Ana P. ${MARK} `, body: " Muy buen servicio. ", rating: 5 };
    check("VIEWER -> Sin permiso y no escribe", (await errorText(() => call(a.viewer, "crear_testimonio", args))).includes("Sin permiso") && (await count()) === n0);
    calls.length = 0;
    const t1 = await call(a.staff, "crear_testimonio", args);
    const row = await prisma.testimonial.findUnique({ where: { id: String(t1.id) } });
    check("STAFF lo crea pendiente, sin consentimiento y sin publicar (campos recortados)", row?.status === "PENDING" && row.consentGrantedAt === null && row.publishedAt === null && row.displayName === `Ana P. ${MARK}` && row.body === "Muy buen servicio." && row.rating === 5, row);
    check("auditoría via claude y entidad Testimonial", await auditOk("crear_testimonio", String(t1.id)));
    check("refresca testimonios, ficha, actividad y portal", refreshes(), calls);
    check("calificación 6 -> ZodError", (await errorName(() => call(a.staff, "crear_testimonio", { ...args, rating: 6 }))) === "ZodError");
    check("texto vacío -> ZodError", (await errorName(() => call(a.staff, "crear_testimonio", { ...args, body: "" }))) === "ZodError");
    const n1 = await count();
    check("cliente de otra organización -> No encontrado y no escribe", (await errorText(() => call(a.staff, "crear_testimonio", { ...args, clientId: b.client.id }))) === "NotFoundError: No encontrado." && (await count()) === n1);

    console.log("editar_testimonio");
    const token = (await prisma.testimonial.findUnique({ where: { id: String(t1.id) } }))!.updatedAt.toISOString();
    const eArgs = { testimonioId: String(t1.id), actualizadoEn: token, clientId: a.client.id, displayName: `Ana ${MARK}`, body: "Texto corregido", rating: 4 };
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "editar_testimonio", eArgs))).includes("Sin permiso"));
    // Un testimonio con consentimiento, aprobado y publicado: editarlo lo devuelve a pendiente y lo despublica.
    const live = await prisma.testimonial.create({ data: { organizationId: a.org.id, clientId: a.client.id, displayName: "Pública", body: "Texto", status: "APPROVED", consentGrantedAt: new Date(), consentVersion: "x", reviewedAt: new Date(), reviewedById: a.owner.userId, publishedAt: new Date() } });
    calls.length = 0;
    const edited = await call(a.staff, "editar_testimonio", { ...eArgs, testimonioId: live.id, actualizadoEn: live.updatedAt.toISOString() });
    const eRow = await prisma.testimonial.findUnique({ where: { id: live.id } });
    check("editar uno aprobado: vuelve a PENDING, se despublica y se revoca el consentimiento", eRow?.status === "PENDING" && eRow.publishedAt === null && eRow.consentRevokedAt !== null && eRow.body === "Texto corregido", eRow);
    check("devuelve el nuevo updatedAt", !!edited.updatedAt && String(edited.updatedAt) !== live.updatedAt.toISOString(), edited);
    check("auditoría y refresco", (await auditOk("editar_testimonio", live.id)) && refreshes(), calls);
    check("token viejo (alguien lo cambió) -> error y sin cambios",
      (await errorText(() => call(a.staff, "editar_testimonio", { ...eArgs, testimonioId: live.id, actualizadoEn: live.updatedAt.toISOString(), body: "Otro" }))).startsWith("DomainError") && (await prisma.testimonial.findUnique({ where: { id: live.id } }))?.body === "Texto corregido");
    check("cambiar de cliente -> error y sin cambios",
      (await errorText(() => call(a.staff, "editar_testimonio", { ...eArgs, testimonioId: String(t1.id), actualizadoEn: token, clientId: b.client.id }))) !== "ok" && (await prisma.testimonial.findUnique({ where: { id: String(t1.id) } }))?.clientId === a.client.id);
    const bT = await prisma.testimonial.create({ data: { organizationId: b.org.id, clientId: b.client.id, displayName: "Ajena", body: "Texto" } });
    check("testimonio ajeno -> No encontrado y sin cambios", (await errorText(() => call(a.staff, "editar_testimonio", { ...eArgs, testimonioId: bT.id, actualizadoEn: bT.updatedAt.toISOString() }))) === "NotFoundError: No encontrado." && (await prisma.testimonial.findUnique({ where: { id: bT.id } }))?.body === "Texto");

    console.log("eliminar_testimonio (AC-7: borrado lógico)");
    const cur = (await prisma.testimonial.findUnique({ where: { id: String(t1.id) } }))!;
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "eliminar_testimonio", { testimonioId: cur.id, actualizadoEn: cur.updatedAt.toISOString() }))).includes("Sin permiso"));
    const n2 = await count();
    calls.length = 0;
    const gone = await call(a.staff, "eliminar_testimonio", { testimonioId: cur.id, actualizadoEn: cur.updatedAt.toISOString() });
    const dRow = await prisma.testimonial.findUnique({ where: { id: cur.id } });
    check("STAFF lo elimina: deletedAt puesto, sigue en la base de datos y sin publicar", gone.deleted === true && !!dRow?.deletedAt && dRow.publishedAt === null && (await count()) === n2, dRow);
    check("auditoría y refresco", (await auditOk("eliminar_testimonio", cur.id)) && refreshes(), calls);
    check("ya eliminado -> No encontrado", (await errorText(() => call(a.staff, "eliminar_testimonio", { testimonioId: cur.id, actualizadoEn: dRow!.updatedAt.toISOString() }))) === "NotFoundError: No encontrado.");
    check("testimonio ajeno -> No encontrado y sin borrar", (await errorText(() => call(a.staff, "eliminar_testimonio", { testimonioId: bT.id, actualizadoEn: bT.updatedAt.toISOString() }))) === "NotFoundError: No encontrado." && (await prisma.testimonial.findUnique({ where: { id: bT.id } }))?.deletedAt === null);
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-testimonials: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
