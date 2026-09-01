/**
 * Verifica y limpia los datos del smoke de intake público.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/intake-cleanup.ts <linkId>
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const linkId = process.argv[2];
  if (!linkId) throw new Error("Falta linkId");

  const link = await prisma.intakeLink.findUniqueOrThrow({
    where: { id: linkId },
    include: { submissions: true },
  });
  console.log(`useCount: ${link.useCount} (esperado 1)`);
  console.log(`submissions: ${link.submissions.length} (esperado 1)`);

  const submission = link.submissions[0];
  if (submission) {
    const client = await prisma.client.findUniqueOrThrow({
      where: { id: submission.clientId },
    });
    console.log(`cliente creado: ${client.clientCode} (${client.firstName} ${client.lastName})`);
    const consents = await prisma.consentRecord.findMany({
      where: { clientId: client.id },
      select: { consentType: true, version: true, signerName: true },
    });
    console.log("consents:", JSON.stringify(consents));
    const audit = await prisma.auditLog.findMany({
      where: { entityType: "IntakeSubmission", entityId: submission.id },
      select: { action: true },
    });
    console.log("audit:", JSON.stringify(audit));

    // Limpieza
    await prisma.consentRecord.deleteMany({ where: { clientId: client.id } });
    await prisma.intakeSubmission.deleteMany({ where: { intakeLinkId: linkId } });
    await prisma.intakeLink.delete({ where: { id: linkId } });
    await prisma.client.delete({ where: { id: client.id } });
    console.log("datos de intake eliminados (AuditLog INTAKE_SUBMITTED conservado)");
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
