/**
 * Smoke DC-005: checklist de documentos por servicio (CREDIT_REPAIR).
 * Crea metadata de Document directamente (sin S3) y verifica conteos.
 *
 * Uso: npx tsx --env-file=.env.local scripts/smoke/dc-005-checklist.ts
 */
import { PrismaClient } from "@prisma/client";
import { createCreditCase } from "../../src/server/cases";
import {
  getCaseDocumentChecklist,
  getChecklistForService,
} from "../../src/server/documents/checklist";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `dc005-${Date.now()}`;

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  let caseId: string | null = null;
  let serviceCaseId: string | null = null;

  try {
    const member = await prisma.organizationMember.findFirst({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    if (!member) throw new Error("No hay OWNER en la org.");
    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: member.role,
    };

    console.log("\n[DC-005] Checklist de documentos por servicio");

    const spec = getChecklistForService("CREDIT_REPAIR");
    check(
      "CREDIT_REPAIR exige ID, domicilio, SSN y reporte",
      spec.required.join(",") ===
        "IDENTITY,PROOF_OF_ADDRESS,SSN_DOCUMENT,CREDIT_REPORT",
    );
    check(
      "servicio desconocido cae al checklist por defecto",
      getChecklistForService("FUTURE_VERTICAL").required.join(",") === "IDENTITY",
    );

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "DC005",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;

    const created = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: `Smoke DC-005 ${MARK}`,
    });
    caseId = created.id;
    serviceCaseId = created.serviceCaseId;

    // Sin documentos: todo lo requerido falta.
    const empty = await getCaseDocumentChecklist(ctx, caseId);
    check("servicio detectado", empty.serviceCode === "CREDIT_REPAIR");
    check(
      "sin docs → 4 requeridos pendientes",
      empty.missingRequired.length === 4,
    );

    // ID a nivel cliente (caseId null) debe contar para el checklist.
    await prisma.document.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseId: null,
        category: "IDENTITY",
        sensitivity: "HIGHLY_SENSITIVE",
        originalName: "id.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        storageKey: `smoke/${MARK}/id.pdf`,
      },
    });
    // Reporte ligado al caso.
    await prisma.document.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseId,
        category: "CREDIT_REPORT",
        sensitivity: "CONFIDENTIAL",
        originalName: "reporte.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        storageKey: `smoke/${MARK}/reporte.pdf`,
      },
    });
    // Documento borrado (soft) NO cuenta.
    await prisma.document.create({
      data: {
        organizationId: ctx.organizationId,
        clientId: client.id,
        caseId,
        category: "SSN_DOCUMENT",
        sensitivity: "HIGHLY_SENSITIVE",
        originalName: "ssn-borrado.pdf",
        mimeType: "application/pdf",
        sizeBytes: 100,
        storageKey: `smoke/${MARK}/ssn-borrado.pdf`,
        deletedAt: new Date(),
      },
    });

    const partial = await getCaseDocumentChecklist(ctx, caseId);
    const rowFor = (cat: string) =>
      partial.rows.find((row) => row.category === cat);
    check("ID de cliente cuenta (caseId null)", rowFor("IDENTITY")?.present === true);
    check(
      "reporte del caso cuenta",
      rowFor("CREDIT_REPORT")?.present === true,
    );
    check(
      "soft-deleted no cuenta",
      rowFor("SSN_DOCUMENT")?.present === false,
    );
    check(
      "quedan 2 requeridos pendientes (orden del checklist)",
      partial.missingRequired.map((r) => r.category).join(",") ===
        "PROOF_OF_ADDRESS,SSN_DOCUMENT",
    );

    console.log(JSON.stringify({ ok: true, caseId }, null, 2));
  } finally {
    console.log("\n[cleanup]");
    if (clientId) {
      await prisma.document.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.activityLog.deleteMany({ where: { clientId } }).catch(() => undefined);
      await prisma.task.deleteMany({ where: { clientId } }).catch(() => undefined);
    }
    if (caseId) {
      await prisma.creditCase.deleteMany({ where: { id: caseId } }).catch(() => undefined);
    }
    if (serviceCaseId) {
      await prisma.serviceCaseStageHistory
        .deleteMany({ where: { serviceCaseId } })
        .catch(() => undefined);
      await prisma.serviceCase.deleteMany({ where: { id: serviceCaseId } }).catch(() => undefined);
    }
    if (clientId) {
      await prisma.client.deleteMany({ where: { id: clientId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
