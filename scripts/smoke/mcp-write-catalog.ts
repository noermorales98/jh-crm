/**
 * Herramientas de escritura del catálogo (servicios y paquetes) del conector MCP contra una
 * base real y desechable. Solo OWNER/ADMIN escriben; archivar nunca borra.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-write-catalog.ts
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
const MARK = `mcpcat${Date.now()}`;
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
  const { catalogTools } = await import("../../src/server/mcp/tools/catalog");
  const a = await seedMcpOrg(prisma, `${MARK}a`);
  const b = await seedMcpOrg(prisma, `${MARK}b`);
  const calls: Array<{ path: string; type?: string }> = [];
  const opts = { tools: catalogTools, revalidate: (path: string, type?: "layout" | "page") => void calls.push({ path, type }) };
  const call = (ctx: typeof a.owner, name: string, args: unknown) => callTool(ctx, name, args, opts) as Promise<Record<string, unknown>>;
  const auditOk = async (name: string, entityId: string, entityType: string) => {
    const row = await prisma.auditLog.findFirst({ where: { organizationId: a.org.id, action: `mcp.tool.${name}`, entityId } });
    return !!row && row.entityType === entityType && meta(row.metadata).via === "claude";
  };
  const refreshes = () => ["/crm/servicios", "/crm/servicios/paquetes", "/crm/cotizaciones/nueva"].every((p) => calls.some((c) => c.path === p));
  const services = () => prisma.service.count({ where: { organizationId: a.org.id } });
  const packages = () => prisma.servicePackage.count({ where: { organizationId: a.org.id } });

  try {
    console.log("metadatos");
    check("6 herramientas con permiso catalog.manage", catalogTools.length === 6 && catalogTools.every((t) => t.permission === "catalog.manage"));
    for (const n of ["archivar_servicio", "archivar_paquete"]) {
      const t = catalogTools.find((x) => x.name === n)!;
      check(`${n} es destructive, pide confirmación y no promete deshacer`, t.kind === "destructive" && /confirm/i.test(t.description) && !/deshac|revert|reabr|recuper|restaur/i.test(t.description), t.description);
    }
    check("ninguna abre mundo", catalogTools.every((t) => !t.openWorld));

    console.log("crear_servicio");
    const n0 = await services();
    check("STAFF -> Sin permiso (solo dueños y administradores) y no escribe",
      (await errorText(() => call(a.staff, "crear_servicio", { name: `S ${MARK}`, defaultPrice: 100 }))).includes("Sin permiso") && (await services()) === n0);
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "crear_servicio", { name: `S ${MARK}`, defaultPrice: 100 }))).includes("Sin permiso"));
    calls.length = 0;
    const svc = await call(a.owner, "crear_servicio", { name: `  Servicio ${MARK} `, description: "desc", defaultPrice: "250.50", currency: "USD" });
    const sRow = await prisma.service.findUnique({ where: { id: String(svc.id) } });
    check("OWNER crea el servicio (nombre recortado, precio exacto, activo)", sRow?.name === `Servicio ${MARK}` && sRow.defaultPrice.toString() === "250.5" && sRow.isActive && sRow.code === null, sRow);
    check("resultado con enlace al catálogo", String(svc.href).endsWith("/crm/servicios"), svc);
    check("auditoría via claude y entidad Service", await auditOk("crear_servicio", String(svc.id), "Service"));
    check("refresca servicios, paquetes y cotización nueva", refreshes(), calls);
    check("nombre repetido -> error y no escribe", (await errorText(() => call(a.owner, "crear_servicio", { name: `Servicio ${MARK}`, defaultPrice: 1 }))) !== "ok" && (await services()) === n0 + 1);
    check("precio inválido -> ZodError", (await errorName(() => call(a.owner, "crear_servicio", { name: `X ${MARK}`, defaultPrice: "abc" }))) === "ZodError");
    check("código de vertical inválido -> ZodError", (await errorName(() => call(a.owner, "crear_servicio", { name: `Y ${MARK}`, defaultPrice: 1, code: "MAGIA" }))) === "ZodError");
    const coded = await call(a.owner, "crear_servicio", { name: `Web ${MARK}`, defaultPrice: 10, code: "WEB_DEVELOPMENT" });
    check("con código de vertical válido", (await prisma.service.findUnique({ where: { id: String(coded.id) } }))?.code === "WEB_DEVELOPMENT");

    console.log("editar_servicio");
    check("STAFF -> Sin permiso", (await errorText(() => call(a.staff, "editar_servicio", { servicioId: String(svc.id), defaultPrice: 1 }))).includes("Sin permiso"));
    calls.length = 0;
    await call(a.owner, "editar_servicio", { servicioId: String(svc.id), defaultPrice: 300, description: null });
    const eRow = await prisma.service.findUnique({ where: { id: String(svc.id) } });
    check("OWNER cambia precio y borra descripción; el nombre queda igual", eRow?.defaultPrice.toString() === "300" && eRow.description === null && eRow.name === `Servicio ${MARK}`, eRow);
    check("auditoría y refresco", (await auditOk("editar_servicio", String(svc.id), "Service")) && refreshes(), calls);
    const bSvc = await prisma.service.create({ data: { organizationId: b.org.id, name: `Ajeno ${MARK}`, defaultPrice: 5 } });
    check("servicio ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.owner, "editar_servicio", { servicioId: bSvc.id, defaultPrice: 999 }))) === "NotFoundError: No encontrado." && (await prisma.service.findUnique({ where: { id: bSvc.id } }))?.defaultPrice.toString() === "5");

    console.log("archivar_servicio (borrado lógico)");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "archivar_servicio", { servicioId: String(svc.id) }))).includes("Sin permiso"));
    const n1 = await services();
    const arch = await call(a.owner, "archivar_servicio", { servicioId: String(svc.id) });
    check("OWNER archiva: isActive false y el servicio sigue existiendo", arch.isActive === false && (await services()) === n1 && (await prisma.service.findUnique({ where: { id: String(svc.id) } }))?.isActive === false);
    check("auditoría", await auditOk("archivar_servicio", String(svc.id), "Service"));
    check("servicio ajeno -> No encontrado y sigue activo",
      (await errorText(() => call(a.owner, "archivar_servicio", { servicioId: bSvc.id }))) === "NotFoundError: No encontrado." && (await prisma.service.findUnique({ where: { id: bSvc.id } }))?.isActive === true);

    console.log("crear_paquete");
    const s2 = await call(a.owner, "crear_servicio", { name: `Dos ${MARK}`, defaultPrice: 40 });
    const s3 = await call(a.owner, "crear_servicio", { name: `Tres ${MARK}`, defaultPrice: 60 });
    const pArgs = { name: `Paquete ${MARK}`, defaultPrice: 90, items: [{ serviceId: String(s2.id), quantity: 2 }, { serviceId: String(s3.id), quantity: 1 }] };
    const p0 = await packages();
    check("STAFF -> Sin permiso y no escribe", (await errorText(() => call(a.staff, "crear_paquete", pArgs))).includes("Sin permiso") && (await packages()) === p0);
    calls.length = 0;
    const pkg = await call(a.owner, "crear_paquete", pArgs);
    const pRow = await prisma.servicePackage.findUnique({ where: { id: String(pkg.id) }, include: { items: true } });
    check("OWNER crea el paquete con sus 2 servicios y cantidades", pRow?.items.length === 2 && pRow.items.some((i) => i.serviceId === String(s2.id) && i.quantity === 2), pRow);
    check("auditoría y refresco", (await auditOk("crear_paquete", String(pkg.id), "ServicePackage")) && refreshes() && String(pkg.href).endsWith("/crm/servicios/paquetes"), calls);
    check("sin servicios -> ZodError", (await errorName(() => call(a.owner, "crear_paquete", { ...pArgs, name: `Vacío ${MARK}`, items: [] }))) === "ZodError");
    check("cantidad 0 -> ZodError", (await errorName(() => call(a.owner, "crear_paquete", { ...pArgs, name: `Cero ${MARK}`, items: [{ serviceId: String(s2.id), quantity: 0 }] }))) === "ZodError");
    const p1 = await packages();
    check("servicio archivado dentro del paquete -> error y no escribe",
      (await errorText(() => call(a.owner, "crear_paquete", { ...pArgs, name: `Arch ${MARK}`, items: [{ serviceId: String(svc.id), quantity: 1 }] }))).startsWith("DomainError") && (await packages()) === p1);
    check("servicio de otra organización dentro del paquete -> error y no escribe",
      (await errorText(() => call(a.owner, "crear_paquete", { ...pArgs, name: `Aj ${MARK}`, items: [{ serviceId: bSvc.id, quantity: 1 }] }))).startsWith("DomainError") && (await packages()) === p1);

    console.log("editar_paquete");
    check("STAFF -> Sin permiso", (await errorText(() => call(a.staff, "editar_paquete", { paqueteId: String(pkg.id), defaultPrice: 1 }))).includes("Sin permiso"));
    await call(a.owner, "editar_paquete", { paqueteId: String(pkg.id), defaultPrice: 120 });
    const e1 = await prisma.servicePackage.findUnique({ where: { id: String(pkg.id) }, include: { items: true } });
    check("sin `items` no toca los servicios", e1?.defaultPrice.toString() === "120" && e1.items.length === 2 && e1.name === `Paquete ${MARK}`, e1);
    calls.length = 0;
    await call(a.owner, "editar_paquete", { paqueteId: String(pkg.id), items: [{ serviceId: String(s3.id), quantity: 5 }] });
    const e2 = await prisma.servicePackage.findUnique({ where: { id: String(pkg.id) }, include: { items: true } });
    check("con `items` reemplaza la lista completa", e2?.items.length === 1 && e2.items[0].serviceId === String(s3.id) && e2.items[0].quantity === 5, e2?.items);
    check("auditoría y refresco", (await auditOk("editar_paquete", String(pkg.id), "ServicePackage")) && refreshes(), calls);
    const bPkg = await prisma.servicePackage.create({ data: { organizationId: b.org.id, name: `PAj ${MARK}`, defaultPrice: 5 } });
    check("paquete ajeno -> No encontrado y sin cambios",
      (await errorText(() => call(a.owner, "editar_paquete", { paqueteId: bPkg.id, defaultPrice: 999 }))) === "NotFoundError: No encontrado." && (await prisma.servicePackage.findUnique({ where: { id: bPkg.id } }))?.defaultPrice.toString() === "5");

    console.log("archivar_paquete (borrado lógico)");
    check("VIEWER -> Sin permiso", (await errorText(() => call(a.viewer, "archivar_paquete", { paqueteId: String(pkg.id) }))).includes("Sin permiso"));
    const p2 = await packages();
    const ap = await call(a.owner, "archivar_paquete", { paqueteId: String(pkg.id) });
    check("OWNER archiva: isActive false y el paquete sigue existiendo", ap.isActive === false && (await packages()) === p2 && (await prisma.servicePackage.findUnique({ where: { id: String(pkg.id) } }))?.isActive === false);
    check("auditoría", await auditOk("archivar_paquete", String(pkg.id), "ServicePackage"));
    check("paquete ajeno -> No encontrado y sigue activo",
      (await errorText(() => call(a.owner, "archivar_paquete", { paqueteId: bPkg.id }))) === "NotFoundError: No encontrado." && (await prisma.servicePackage.findUnique({ where: { id: bPkg.id } }))?.isActive === true);
  } finally {
    await a.cleanup();
    await b.cleanup();
    await prisma.$disconnect();
  }
  if (failed) {
    console.error(`\n${failed} comprobaciones fallaron`);
    process.exit(1);
  }
  console.log("\nmcp-write-catalog: OK");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
