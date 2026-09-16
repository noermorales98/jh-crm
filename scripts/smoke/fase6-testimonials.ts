/** Fase 6 / TM-001…004. Uso: npx tsx --env-file=.env.local scripts/smoke/fase6-testimonials.ts */
import { PrismaClient } from "@prisma/client";
import { createServiceCase } from "../../src/server/cases";
import {
  createTestimonial,
  changeTestimonial,
  listTestimonials,
  listPublicTestimonials,
  type TestimonialCommand,
} from "../../src/server/testimonials";
import { GET } from "../../app/api/public/testimonials/route";
import { DomainError } from "../../src/server/errors";
import {
  ForbiddenError,
  type OrganizationContext,
} from "../../src/server/auth/guards";
import type { PortalContext } from "../../src/server/portal";

const MARK = `fase6-${Date.now()}`;
let checks = 0;
function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  checks++;
  console.log(`  ✓ ${label}`);
}
async function rejected(label: string, run: () => Promise<unknown>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof DomainError || error instanceof ForbiddenError) {
      check(label, true);
      return;
    }
    throw error;
  }
  throw new Error(`FAIL: ${label}: no rechazó la operación`);
}
async function main() {
  const prisma = new PrismaClient();
  const clientIds: string[] = [];
  const testimonialIds: string[] = [];
  let otherOrgId: string | null = null;
  try {
    const siteOrg = await prisma.organization.findFirstOrThrow({
      orderBy: { createdAt: "asc" },
    });
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { role: "OWNER", organizationId: siteOrg.id },
    });
    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: "OWNER",
    };
    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `${MARK}-a`,
        firstName: "FASE6",
        lastName: MARK,
        status: "ACTIVE",
      },
    });
    clientIds.push(client.id);
    const second = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `${MARK}-b`,
        firstName: "FASE6",
        lastName: `${MARK}-b`,
      },
    });
    clientIds.push(second.id);
    const service = await createServiceCase(ctx, {
      clientId: client.id,
      serviceCode: "HOME_BUYER",
    });
    const portal: PortalContext = {
      accessId: MARK,
      clientId: client.id,
      organizationId: ctx.organizationId,
      email: "smoke@example.invalid",
    };
    const otherPortal: PortalContext = { ...portal, clientId: second.id };
    const input = {
      clientId: client.id,
      serviceCaseId: service.serviceCase.id,
      displayName: MARK,
      body: `Excelente atención ${MARK}`,
      rating: 5,
    };
    console.log("\n[Fase 6] Testimonios");
    let row = await createTestimonial(ctx, input);
    testimonialIds.push(row.id);
    const change = async (command: TestimonialCommand) => {
      row = await changeTestimonial(ctx, row.id, row.updatedAt, command);
      return row;
    };
    const publicContains = async () =>
      (await listPublicTestimonials()).some((r) => r.displayName === MARK);
    check(
      "crea PENDING sin consentimiento ni publicación",
      row.status === "PENDING" && !row.consentGrantedAt && !row.publishedAt,
    );
    check(
      "listado ligado a cliente y ServiceCase",
      (await listTestimonials(ctx, client.id)).some(
        (r) => r.id === row.id && r.serviceCaseId === service.serviceCase.id,
      ),
    );
    await rejected("bloquea expediente de otro cliente", () =>
      createTestimonial(ctx, { ...input, clientId: second.id }),
    );
    await rejected("VIEWER no puede crear", () =>
      createTestimonial({ ...ctx, role: "VIEWER" }, input),
    );
    await rejected("STAFF no puede aprobar", () =>
      changeTestimonial({ ...ctx, role: "STAFF" }, row.id, row.updatedAt, {
        kind: "review",
        status: "APPROVED",
      }),
    );
    await rejected("STAFF no puede publicar", () =>
      changeTestimonial({ ...ctx, role: "STAFF" }, row.id, row.updatedAt, {
        kind: "publish",
        published: true,
      }),
    );
    await rejected("no aprueba sin consentimiento", () =>
      change({ kind: "review", status: "APPROVED" }),
    );
    await rejected("no publica sin aprobación", () =>
      change({ kind: "publish", published: true }),
    );
    check("PENDING no aparece en público", !(await publicContains()));
    await rejected("consentimiento manual requiere evidencia", () =>
      change({ kind: "consent", granted: true, signerName: "Cliente" }),
    );
    await change({
      kind: "consent",
      granted: true,
      signerName: "Cliente",
      evidence: `Aceptación escrita ${MARK}: fecha 2026-09-15, mensaje de prueba`,
    });
    check(
      "guarda firmante, texto, versión, huella y actor",
      Boolean(
        row.consentGrantedAt &&
        row.consentSignerName &&
        row.consentText &&
        row.consentVersion &&
        row.consentContentHash &&
        row.consentRecordedById === ctx.userId,
      ),
    );
    check(
      "consentimiento no publica automáticamente",
      !(await publicContains()),
    );
    await change({ kind: "review", status: "APPROVED" });
    check(
      "aprobación humana sin publicación automática",
      row.status === "APPROVED" &&
        row.reviewedById === ctx.userId &&
        Boolean(row.reviewedAt) &&
        !row.publishedAt &&
        !(await publicContains()),
    );
    await change({ kind: "publish", published: true });
    check("publicación explícita aparece en público", await publicContains());
    const response = await GET();
    const json = await response.json();
    const publicRow = json.testimonials.find(
      (r: { displayName: string }) => r.displayName === MARK,
    );
    check(
      "endpoint anónimo 200 y no-store",
      response.status === 200 &&
        response.headers.get("Cache-Control") === "no-store" &&
        json.ok === true,
    );
    check(
      "endpoint solo entrega nombre público, texto, rating y fecha",
      Boolean(publicRow) &&
        Object.keys(publicRow).sort().join(",") ===
          "body,displayName,publishedAt,rating" &&
        publicRow.body === input.body,
    );
    await change({ kind: "publish", published: false });
    check(
      "retiro manual de publicación",
      !(await publicContains()) && row.status === "APPROVED",
    );
    await change({ kind: "publish", published: true });
    const oldVersion = row.updatedAt;
    await change({
      kind: "edit",
      data: { ...input, body: `${input.body} editado` },
    });
    check(
      "editar invalida consentimiento, aprobación y publicación",
      row.status === "PENDING" &&
        Boolean(row.consentRevokedAt) &&
        !row.reviewedAt &&
        !row.publishedAt &&
        !(await publicContains()),
    );
    await rejected("pantalla obsoleta no puede aprobar", () =>
      changeTestimonial(ctx, row.id, oldVersion, {
        kind: "review",
        status: "APPROVED",
      }),
    );
    await rejected("editar exige nuevo consentimiento", () =>
      change({ kind: "review", status: "APPROVED" }),
    );
    await change({
      kind: "consent",
      granted: true,
      signerName: "Cliente",
      evidence: `Nueva autorización ${MARK}`,
    });
    await change({ kind: "review", status: "REJECTED" });
    check(
      "rechazado no aparece en público",
      row.status === "REJECTED" && !(await publicContains()),
    );
    await rejected("rechazado no puede publicar", () =>
      change({ kind: "publish", published: true }),
    );
    await change({ kind: "review", status: "APPROVED" });
    await change({ kind: "publish", published: true });
    row = await changeTestimonial(portal, row.id, row.updatedAt, {
      kind: "consent",
      granted: false,
    });
    check(
      "cliente retira consentimiento y desaparece del endpoint",
      Boolean(row.consentRevokedAt) &&
        !row.publishedAt &&
        !(await (await GET()).json()).testimonials.some(
          (r: { displayName: string }) => r.displayName === MARK,
        ),
    );
    await rejected("portal requiere aceptación expresa", () =>
      createTestimonial(portal, input, {
        accepted: false,
        signerName: "Cliente",
      }),
    );
    let portalRow = await createTestimonial(
      portal,
      { ...input, displayName: `${MARK}-portal` },
      { accepted: true, signerName: "Cliente" },
    );
    testimonialIds.push(portalRow.id);
    check(
      "portal captura consentimiento y queda pendiente",
      Boolean(
        portalRow.consentGrantedAt && portalRow.consentEvidence?.includes(MARK),
      ) &&
        portalRow.status === "PENDING" &&
        !portalRow.publishedAt &&
        !portalRow.consentRecordedById,
    );
    await rejected("portal no acepta clientId ajeno", () =>
      createTestimonial(otherPortal, input, {
        accepted: true,
        signerName: "Otro",
      }),
    );
    await rejected("portal no puede editar testimonio ajeno", () =>
      changeTestimonial(otherPortal, portalRow.id, portalRow.updatedAt, {
        kind: "edit",
        data: input,
      }),
    );
    await rejected("portal no puede retirar consentimiento ajeno", () =>
      changeTestimonial(otherPortal, portalRow.id, portalRow.updatedAt, {
        kind: "consent",
        granted: false,
      }),
    );
    await rejected("portal no puede aprobar", () =>
      changeTestimonial(portal, portalRow.id, portalRow.updatedAt, {
        kind: "review",
        status: "APPROVED",
      }),
    );
    await rejected("portal no puede publicar", () =>
      changeTestimonial(portal, portalRow.id, portalRow.updatedAt, {
        kind: "publish",
        published: true,
      }),
    );
    check(
      "portal lista solo testimonios propios",
      (await listTestimonials(otherPortal, client.id)).length === 0,
    );
    const org = await prisma.organization.create({ data: { name: MARK } });
    otherOrgId = org.id;
    const foreignCtx = { ...ctx, organizationId: org.id };
    check(
      "aislamiento de lectura por organización",
      (await listTestimonials(foreignCtx)).length === 0,
    );
    await rejected("aislamiento de escritura por organización", () =>
      changeTestimonial(foreignCtx, row.id, row.updatedAt, { kind: "delete" }),
    );
    const outsider = await prisma.client.create({
      data: { organizationId: org.id, clientCode: MARK, firstName: MARK },
    });
    clientIds.push(outsider.id);
    const foreign = await createTestimonial(foreignCtx, {
      ...input,
      clientId: outsider.id,
      serviceCaseId: null,
      displayName: `${MARK}-foreign`,
    });
    testimonialIds.push(foreign.id);
    let approvedForeign = await changeTestimonial(
      foreignCtx,
      foreign.id,
      foreign.updatedAt,
      { kind: "consent", granted: true, signerName: "Otro", evidence: MARK },
    );
    approvedForeign = await changeTestimonial(
      foreignCtx,
      foreign.id,
      approvedForeign.updatedAt,
      { kind: "review", status: "APPROVED" },
    );
    await changeTestimonial(foreignCtx, foreign.id, approvedForeign.updatedAt, {
      kind: "publish",
      published: true,
    });
    check(
      "endpoint no mezcla organizaciones",
      !(await listPublicTestimonials()).some(
        (r) => r.displayName === `${MARK}-foreign`,
      ),
    );
    portalRow = await changeTestimonial(
      ctx,
      portalRow.id,
      portalRow.updatedAt,
      { kind: "review", status: "APPROVED" },
    );
    portalRow = await changeTestimonial(
      ctx,
      portalRow.id,
      portalRow.updatedAt,
      { kind: "publish", published: true },
    );
    await prisma.client.update({
      where: { id: client.id },
      data: { archivedAt: new Date() },
    });
    check(
      "cliente archivado excluido del endpoint",
      !(await listPublicTestimonials()).some(
        (r) => r.displayName === `${MARK}-portal`,
      ),
    );
    await prisma.client.update({
      where: { id: client.id },
      data: { archivedAt: null },
    });
    await prisma.serviceCase.update({
      where: { id: service.serviceCase.id },
      data: { archivedAt: new Date() },
    });
    check(
      "expediente archivado excluido del endpoint",
      !(await listPublicTestimonials()).some(
        (r) => r.displayName === `${MARK}-portal`,
      ),
    );
    await prisma.serviceCase.update({
      where: { id: service.serviceCase.id },
      data: { archivedAt: null },
    });
    await changeTestimonial(ctx, portalRow.id, portalRow.updatedAt, {
      kind: "delete",
    });
    check(
      "soft delete preserva registro y excluye listados y público",
      Boolean(
        (
          await prisma.testimonial.findUniqueOrThrow({
            where: { id: portalRow.id },
          })
        ).deletedAt,
      ) &&
        !(await listTestimonials(ctx)).some((r) => r.id === portalRow.id) &&
        !(await listPublicTestimonials()).some(
          (r) => r.displayName === `${MARK}-portal`,
        ),
    );
    check(
      "auditoría registra aprobación/publicación/consentimiento",
      (await prisma.auditLog.count({
        where: { entityType: "Testimonial", entityId: { in: testimonialIds } },
      })) >= 15,
    );
    check(
      "actividad ligada al cliente y expediente",
      (await prisma.activityLog.count({
        where: {
          clientId: client.id,
          serviceCaseId: service.serviceCase.id,
          type: "OTHER",
        },
      })) >= 15,
    );
    console.log(`\nOK ${checks}/${checks}`);
  } finally {
    // Solo fixtures de esta ejecución: nunca borrar auditoría por rango de fechas.
    await prisma.auditLog.deleteMany({
      where: { entityType: "Testimonial", entityId: { in: testimonialIds } },
    });
    if (clientIds.length) {
      const serviceCases = await prisma.serviceCase.findMany({
        where: { clientId: { in: clientIds } },
        select: { id: true },
      });
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: serviceCases.map((c) => c.id) } },
      });
      await prisma.activityLog.deleteMany({
        where: { clientId: { in: clientIds } },
      });
      await prisma.client.deleteMany({ where: { id: { in: clientIds } } });
    }
    if (otherOrgId)
      await prisma.organization.delete({ where: { id: otherOrgId } });
    await prisma.$disconnect();
    console.log(`[cleanup] ${MARK}`);
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
