/**
 * Lecturas de la tanda 3b del conector MCP contra una base real y desechable: servicios,
 * paquetes, procesadores (con sus cuentas), testimonios, comparaciones y financiamiento.
 * Nada de otra organización; nada sensible; un VIEWER lee.
 *
 *   DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npx tsx scripts/smoke/mcp-read-tools-4.ts
 */
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { TESTIMONIAL_CONSENT_VERSION } from "../../src/lib/testimonials";
import { assertDisposableDb, seedMcpOrg } from "./_lib/mcp-seed";

assertDisposableDb();

const prisma = new PrismaClient();
const MARK = `mcpr4${Date.now()}`;
const AFFILIATE = `https://aff.example.test/?id=AFILIADO${MARK}`;
const EXT_ID = `EXTID${MARK}`;
const EXT_URL = `https://monitor.example.test/cuenta/${MARK}`;
const CONSENT_EVIDENCE = `EVIDENCIA-${MARK}`;
const SSN = "123-45-6789";
const cleanups: Array<() => Promise<void>> = [];
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

async function errorText(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return `${(error as Error).name}: ${(error as Error).message}`;
  }
}

/** Misma huella que usa el servicio: nombre, texto y calificación (oráculo independiente). */
const consentHash = (displayName: string, body: string, rating: number | null) =>
  createHash("sha256").update(JSON.stringify([displayName, body, rating])).digest("hex");

async function seed(suffix: string) {
  const s = await seedMcpOrg(prisma, `${MARK}${suffix}`);
  cleanups.push(s.cleanup);
  const orgId = s.org.id;
  const clientId = s.client.id;
  const service = await prisma.service.create({ data: { organizationId: orgId, name: `Servicio ${suffix} ${MARK}`, defaultPrice: 100 } });
  const archivedService = await prisma.service.create({ data: { organizationId: orgId, name: `Viejo ${suffix} ${MARK}`, defaultPrice: 1, isActive: false } });
  const pkg = await prisma.servicePackage.create({
    data: { organizationId: orgId, name: `Paquete ${suffix} ${MARK}`, defaultPrice: 90, items: { create: [{ serviceId: service.id, quantity: 2 }] } },
  });
  const processor = await prisma.creditProcessor.create({
    data: { organizationId: orgId, name: `Monitor ${suffix} ${MARK}`, affiliateUrl: AFFILIATE, monthlyPrice: 29.99, instructions: `Instrucciones con SSN ${SSN}` },
  });
  const inactiveProcessor = await prisma.creditProcessor.create({ data: { organizationId: orgId, name: `Inactivo ${suffix} ${MARK}`, active: false } });
  const account = await prisma.clientProcessorAccount.create({
    data: { organizationId: orgId, processorId: processor.id, clientId, status: "ACTIVE", externalMemberId: EXT_ID, externalUrl: EXT_URL },
  });
  const testimonial = await prisma.testimonial.create({
    data: {
      organizationId: orgId, clientId, displayName: `Ana ${suffix}`, body: `Excelente. SSN ${SSN}`, rating: 5,
      consentGrantedAt: new Date(), consentSignerName: "Firmante", consentEvidence: CONSENT_EVIDENCE,
      consentVersion: TESTIMONIAL_CONSENT_VERSION, consentContentHash: consentHash(`Ana ${suffix}`, `Excelente. SSN ${SSN}`, 5),
    },
  });
  const staleTestimonial = await prisma.testimonial.create({
    data: { organizationId: orgId, clientId, displayName: `Vieja ${suffix}`, body: "x", consentGrantedAt: new Date(), consentVersion: "version-antigua", consentContentHash: consentHash(`Vieja ${suffix}`, "x", null) },
  });
  const revokedTestimonial = await prisma.testimonial.create({
    data: { organizationId: orgId, clientId, displayName: `Revocada ${suffix}`, body: "x", consentGrantedAt: new Date(), consentRevokedAt: new Date(), consentVersion: "v1" },
  });
  const deletedTestimonial = await prisma.testimonial.create({
    data: { organizationId: orgId, clientId, displayName: `Borrada ${suffix}`, body: "x", deletedAt: new Date() },
  });
  const serviceCase = await prisma.serviceCase.create({
    data: { organizationId: orgId, clientId, serviceId: s.service.id, caseNumber: `SC-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id } as never,
  });
  const creditCase = await prisma.creditCase.create({
    data: { organizationId: orgId, clientId, serviceCaseId: serviceCase.id, caseCode: `CC-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id },
  });
  const r1 = await prisma.creditReport.create({ data: { organizationId: orgId, clientId, caseId: creditCase.id, provider: "P", reportDate: new Date("2026-01-10") } });
  const r2 = await prisma.creditReport.create({ data: { organizationId: orgId, clientId, caseId: creditCase.id, provider: "P", reportDate: new Date("2026-03-10") } });
  const comparison = await prisma.reportComparison.create({
    data: { organizationId: orgId, caseId: creditCase.id, baseReportId: r1.id, compareReportId: r2.id, notes: `Notas ${suffix}` },
  });
  const cItem = await prisma.reportComparisonItem.create({
    data: { comparisonId: comparison.id, autoResult: "NEW", manualResult: "VERIFIED", matchKey: "k", creditorName: `Acreedor ${suffix}`, bureau: "EXPERIAN", accountNumberMasked: "****1234", notes: "n" },
  });
  const bizService = await prisma.service.create({ data: { organizationId: orgId, code: "BUSINESS_CREDIT", name: `Negocios ${suffix} ${MARK}` } });
  const fServiceCase = await prisma.serviceCase.create({
    data: { organizationId: orgId, clientId, serviceId: bizService.id, caseNumber: `SF-${suffix}-${MARK}`.slice(0, 30), stageId: s.stage.id } as never,
  });
  const fundingCase = await prisma.fundingCase.create({ data: { organizationId: orgId, serviceCaseId: fServiceCase.id } });
  const application = await prisma.fundingApplication.create({
    data: { organizationId: orgId, fundingCaseId: fundingCase.id, lenderName: `Banco ${suffix} ${MARK}`, requestedAmount: 25000, status: "SUBMITTED", notes: `Notas ${suffix}` },
  });
  return { s, service, archivedService, pkg, processor, inactiveProcessor, account, testimonial, staleTestimonial, revokedTestimonial, deletedTestimonial, comparison, cItem, application, fServiceCase, creditCase };
}

async function run() {
  const { allTools } = await import("../../src/server/mcp/tools");
  const { callTool } = await import("../../src/server/mcp/dispatch");
  const opts = { tools: allTools() };

  const a = await seed("A");
  const b = await seed("B");
  const octx = a.s.owner;
  const vctx = a.s.viewer;

  const ids: Record<string, { a: string; b: string; href: string }> = {
    servicios: { a: a.service.id, b: b.service.id, href: "/crm/servicios" },
    paquetes: { a: a.pkg.id, b: b.pkg.id, href: "/crm/servicios/paquetes" },
    procesadores: { a: a.processor.id, b: b.processor.id, href: "/crm/procesadores" },
    testimonios: { a: a.testimonial.id, b: b.testimonial.id, href: "/crm/testimonios" },
    comparaciones: { a: a.comparison.id, b: b.comparison.id, href: `/crm/clientes/${a.s.client.id}/servicios/` },
    financiamiento: { a: a.application.id, b: b.application.id, href: `/crm/expedientes/${a.fServiceCase.id}` },
  };
  const secrets = [AFFILIATE, `AFILIADO${MARK}`, EXT_ID, EXT_URL, CONSENT_EVIDENCE, SSN, "****1234", "Firmante"];
  const leaks = (text: string) => secrets.filter((secret) => text.includes(secret));

  console.log("\n[mcp-read-tools-4] listar y ver cada sección\n");
  for (const [seccion, id] of Object.entries(ids)) {
    const list = await callTool(octx, "listar", { seccion, texto: MARK }, opts).catch((e) => e);
    const listText = JSON.stringify(list);
    check(`listar ${seccion} → incluye el registro propio`, listText.includes(id.a), listText.slice(0, 300));
    check(`listar ${seccion} → no mezcla otra organización`, !listText.includes(id.b));
    const seen = await callTool(octx, "ver", { seccion, id: id.a }, opts).catch((e) => e);
    const seenText = JSON.stringify(seen);
    check(`ver ${seccion} → devuelve el registro`, !(seen instanceof Error) && seenText.includes(id.a), seenText.slice(0, 300));
    check(`ver ${seccion} con id de otra organización → No encontrado`, (await errorText(() => callTool(octx, "ver", { seccion, id: id.b }, opts))) === "NotFoundError: No encontrado.");
    const href = String((seen as { href?: unknown }).href ?? "");
    check(`ver ${seccion} → enlace exacto a su página`, seccion === "comparaciones" ? href.includes(id.href) : href.endsWith(id.href), href);
    check(`ver ${seccion} → nada sensible`, leaks(seenText).length === 0, leaks(seenText));
    check(`listar ${seccion} → nada sensible`, leaks(listText).length === 0, leaks(listText));
    check(`VIEWER puede listar ${seccion}`, (await errorText(() => callTool(vctx, "listar", { seccion }, opts))) === "ok");
    check(`VIEWER puede ver ${seccion}`, (await errorText(() => callTool(vctx, "ver", { seccion, id: id.a }, opts))) === "ok");
  }

  console.log("\n[mcp-read-tools-4] detalle y filtros\n");
  const list = async (seccion: string, args: object = {}) => JSON.stringify(await callTool(octx, "listar", { seccion, texto: MARK, ...args }, opts));
  check("servicios ACTIVE → el activo sí, el archivado no", (await list("servicios", { estado: "ACTIVE" })).includes(a.service.id) && !(await list("servicios", { estado: "ACTIVE" })).includes(a.archivedService.id));
  check("servicios ARCHIVED → el archivado sí, el activo no", (await list("servicios", { estado: "archived" })).includes(a.archivedService.id) && !(await list("servicios", { estado: "archived" })).includes(a.service.id));
  check("servicios con estado inválido → DomainError", (await errorText(() => callTool(octx, "listar", { seccion: "servicios", estado: "VIEJO" }, opts))).startsWith("DomainError"));
  check("procesadores INACTIVE → el inactivo sí, el activo no", (await list("procesadores", { estado: "INACTIVE" })).includes(a.inactiveProcessor.id) && !(await list("procesadores", { estado: "INACTIVE" })).includes(a.processor.id));
  check("procesadores ACTIVE → el activo sí, el inactivo no", (await list("procesadores", { estado: "ACTIVE" })).includes(a.processor.id) && !(await list("procesadores", { estado: "ACTIVE" })).includes(a.inactiveProcessor.id));
  check("testimonios eliminados no salen", !(await list("testimonios")).includes(a.deletedTestimonial.id));
  check("ver testimonios eliminado → No encontrado", (await errorText(() => callTool(octx, "ver", { seccion: "testimonios", id: a.deletedTestimonial.id }, opts))) === "NotFoundError: No encontrado.");
  const revoked = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "testimonios", id: a.revokedTestimonial.id }, opts)));
  check("ver testimonios con consentimiento revocado → hasConsent false", revoked.hasConsent === false, revoked);
  const stale = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "testimonios", id: a.staleTestimonial.id }, opts)));
  check("ver testimonios con consentimiento de una versión antigua → hasConsent false (igual que la app)", stale.hasConsent === false, stale);
  check("testimonios PENDING incluye el propio; APPROVED no", (await list("testimonios", { estado: "pending" })).includes(a.testimonial.id) && !(await list("testimonios", { estado: "APPROVED" })).includes(a.testimonial.id));
  check("financiamiento SUBMITTED sí; DRAFT no", (await list("financiamiento", { estado: "submitted" })).includes(a.application.id) && !(await list("financiamiento", { estado: "DRAFT" })).includes(a.application.id));
  check("financiamiento por nombre del prestamista", (await list("financiamiento", { texto: `Banco A ${MARK}` })).includes(a.application.id));

  // Un texto que no coincide deja fuera lo propio; uno que coincide con solo una de las dos filas la deja sola.
  const NADA = `nada-coincide-${MARK}`;
  for (const [seccion, id] of [["servicios", a.service.id], ["paquetes", a.pkg.id], ["procesadores", a.processor.id], ["testimonios", a.testimonial.id], ["comparaciones", a.comparison.id], ["financiamiento", a.application.id]] as const) {
    check(`listar ${seccion} con un texto que no coincide → vacío`, !(await list(seccion, { texto: NADA })).includes(id));
  }
  check("servicios: el texto distingue entre dos servicios de la misma organización", !(await list("servicios", { texto: `Viejo A ${MARK}` })).includes(a.service.id) && (await list("servicios", { texto: `Viejo A ${MARK}` })).includes(a.archivedService.id));
  check("procesadores: el texto distingue entre dos procesadores", !(await list("procesadores", { texto: `Inactivo A ${MARK}` })).includes(a.processor.id));

  const pkg = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "paquetes", id: a.pkg.id }, opts)));
  check("ver paquetes → servicios con cantidad", pkg.items?.length === 1 && pkg.items[0].quantity === 2 && pkg.items[0].serviceId === a.service.id, pkg.items);
  const proc = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "procesadores", id: a.processor.id }, opts)));
  check("ver procesadores → dice que hay enlace de afiliado, sin mostrarlo", proc.hasAffiliateLink === true && !("affiliateUrl" in proc), Object.keys(proc));
  check("ver procesadores → cuentas de clientes con estado, sin identificador ni dirección",
    proc.accountList?.length === 1 && proc.accountList[0].status === "ACTIVE" && proc.accountList[0].hasExternalId === true && proc.accountList[0].hasExternalLink === true && !("externalMemberId" in proc.accountList[0]) && !("externalUrl" in proc.accountList[0]), proc.accountList);
  const tes = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "testimonios", id: a.testimonial.id }, opts)));
  check("ver testimonios → texto, consentimiento vigente y updatedAt; sin evidencia ni firmante", tes.hasConsent === true && !!tes.updatedAt && typeof tes.body === "string" && !("consentEvidence" in tes) && !JSON.stringify(tes).includes("Firmante"), tes);
  const cmp = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "comparaciones", id: a.comparison.id }, opts)));
  check("ver comparaciones → partidas con resultado efectivo (manual manda) y sin número de cuenta",
    cmp.itemList?.length === 1 && cmp.itemList[0].result === "VERIFIED" && cmp.itemList[0].autoResult === "NEW" && !JSON.stringify(cmp).includes("1234"), cmp.itemList);
  check("ver comparaciones con pocas partidas → itemsTruncated false", cmp.itemsTruncated === false, cmp.itemsTruncated);
  await prisma.reportComparisonItem.createMany({
    data: Array.from({ length: 105 }, (_, n) => ({ comparisonId: a.comparison.id, autoResult: "NEW" as const, matchKey: `k${n}`, creditorName: `Extra ${String(n).padStart(3, "0")}`, bureau: "EXPERIAN" as const })),
  });
  const big = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "comparaciones", id: a.comparison.id }, opts)));
  check("ver comparaciones con más de 100 partidas → recorta a 100 y avisa", big.itemList?.length === 100 && big.itemsTruncated === true, { n: big.itemList?.length, t: big.itemsTruncated });
  check("ver procesadores con pocas cuentas → accountsTruncated false", proc.accountsTruncated === false, proc.accountsTruncated);
  const fund = JSON.parse(JSON.stringify(await callTool(octx, "ver", { seccion: "financiamiento", id: a.application.id }, opts)));
  check("ver financiamiento → monto, expediente y updatedAt", fund.requestedAmount?.includes("25,000") && fund.serviceCaseId === a.fServiceCase.id && !!fund.updatedAt, fund);
}

run()
  .catch((error) => {
    failed += 1;
    console.error(error);
  })
  .finally(async () => {
    for (const cleanup of cleanups) await cleanup();
    await prisma.$disconnect();
    if (failed) {
      console.error(`\n${failed} comprobaciones fallaron`);
      process.exit(1);
    }
    console.log("\nmcp-read-tools-4: OK");
  });
