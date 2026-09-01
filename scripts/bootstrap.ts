/**
 * Bootstrap inicial de J&H Multiservices LLC.
 *
 * Uso:
 *   npx tsx --env-file=.env.local scripts/bootstrap.ts
 *
 * Crea (idempotente):
 *   1. Organization "J&H Multiservices LLC"
 *   2. OrganizationSettings con defaults
 *   3. User OWNER (BOOTSTRAP_OWNER_EMAIL / _PASSWORD / _NAME)
 *   4. OrganizationMember role OWNER
 *   5. Las 10 WorkflowStage iniciales
 */
import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "@prisma/client";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

const WORKFLOW_STAGES: Array<{
  key: string;
  name: string;
  order: number;
  color: string;
  isTerminal?: boolean;
}> = [
  { key: "NEW", name: "Nuevo cliente", order: 1, color: "#3B82F6" },
  { key: "DOCUMENTS_PENDING", name: "Documentos pendientes", order: 2, color: "#F59E0B" },
  { key: "ANALYSIS", name: "En análisis", order: 3, color: "#8B5CF6" },
  { key: "QUOTE_SENT", name: "Cotización enviada", order: 4, color: "#06B6D4" },
  { key: "PAYMENT_PENDING", name: "Pendiente de pago", order: 5, color: "#F97316" },
  { key: "IN_PROCESS", name: "En proceso", order: 6, color: "#6366F1" },
  { key: "ACTIVE_ROUND", name: "Ronda activa", order: 7, color: "#10B981" },
  { key: "WAITING_UPDATE", name: "Esperando actualización", order: 8, color: "#EAB308" },
  { key: "PAUSED", name: "Pausado", order: 9, color: "#64748B" },
  { key: "COMPLETED", name: "Finalizado", order: 10, color: "#22C55E", isTerminal: true },
];

async function main() {
  const ownerEmail = requireEnv("BOOTSTRAP_OWNER_EMAIL").trim().toLowerCase();
  const ownerPassword = requireEnv("BOOTSTRAP_OWNER_PASSWORD");
  const ownerName = requireEnv("BOOTSTRAP_OWNER_NAME").trim();
  requireEnv("DATABASE_URL");

  const prisma = new PrismaClient();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Organization
      let organization = await tx.organization.findFirst({
        where: { name: "J&H Multiservices LLC" },
      });
      if (!organization) {
        organization = await tx.organization.create({
          data: { name: "J&H Multiservices LLC" },
        });
      }

      // 2. OrganizationSettings (defaults)
      const settings = await tx.organizationSettings.upsert({
        where: { organizationId: organization.id },
        update: {},
        create: { organizationId: organization.id },
      });

      // 3. User OWNER
      const passwordHash = await bcrypt.hash(ownerPassword, 12);
      const existingUser = await tx.user.findUnique({ where: { email: ownerEmail } });
      const user = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: { name: ownerName, isActive: true },
          })
        : await tx.user.create({
            data: { email: ownerEmail, name: ownerName, passwordHash },
          });

      // 4. OrganizationMember OWNER
      await tx.organizationMember.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId: organization.id },
        },
        update: { role: Role.OWNER },
        create: { userId: user.id, organizationId: organization.id, role: Role.OWNER },
      });

      // 5. WorkflowStage iniciales
      const stages = [];
      for (const stage of WORKFLOW_STAGES) {
        stages.push(
          await tx.workflowStage.upsert({
            where: {
              organizationId_key: { organizationId: organization.id, key: stage.key },
            },
            update: {
              name: stage.name,
              color: stage.color,
              isTerminal: stage.isTerminal ?? false,
            },
            create: {
              organizationId: organization.id,
              key: stage.key,
              name: stage.name,
              order: stage.order,
              color: stage.color,
              isTerminal: stage.isTerminal ?? false,
            },
          }),
        );
      }

      return { organization, settings, user, stagesCount: stages.length };
    });

    console.log("Bootstrap completado:");
    console.log(`  Organización : ${result.organization.name} (${result.organization.id})`);
    console.log(`  Settings     : ${result.settings.id}`);
    console.log(`  Usuario OWNER: ${result.user.email} (${result.user.id})`);
    console.log(`  Etapas       : ${result.stagesCount}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Error en bootstrap:", error);
  process.exit(1);
});
