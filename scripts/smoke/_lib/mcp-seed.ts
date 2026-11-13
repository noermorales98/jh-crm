/**
 * Siembra común para las pruebas del conector MCP (solo BD local desechable jh_gates).
 * Crea una organización con el conector encendido, usuarios por rol, un servicio con su
 * etapa y un cliente. `cleanup()` borra todo lo creado.
 */
import type { PrismaClient, Role } from "@prisma/client";

export function assertDisposableDb() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/^mysql:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\/jh_gates(\?|$)/.test(url)) {
    throw new Error("Esta prueba solo corre contra la base local desechable jh_gates.");
  }
}

export interface McpTestCtx {
  userId: string;
  organizationId: string;
  role: Role;
  connectionId: string;
}

export async function seedMcpOrg(prisma: PrismaClient, mark: string) {
  const org = await prisma.organization.create({ data: { name: `TEST JH-CRM ${mark}` } });
  await prisma.organizationSettings.create({ data: { organizationId: org.id, mcpEnabled: true } });
  const users: string[] = [];
  async function member(role: Role): Promise<McpTestCtx> {
    const user = await prisma.user.create({
      data: { email: `${mark}-${role.toLowerCase()}-${users.length}@example.test`, passwordHash: "x", name: `${role} ${mark}` },
    });
    users.push(user.id);
    await prisma.organizationMember.create({ data: { userId: user.id, organizationId: org.id, role } });
    return { userId: user.id, organizationId: org.id, role, connectionId: `conn-${mark}-${users.length}` };
  }
  const owner = await member("OWNER");
  const staff = await member("STAFF");
  const viewer = await member("VIEWER");
  const service = await prisma.service.create({
    data: { organizationId: org.id, code: "CREDIT_REPAIR", name: "Reparación de crédito" },
  });
  const stage = await prisma.workflowStage.create({
    data: { organizationId: org.id, serviceId: service.id, key: "INICIO", name: "Inicio", order: 1 },
  });
  const stage2 = await prisma.workflowStage.create({
    data: { organizationId: org.id, serviceId: service.id, key: "SEGUNDA", name: "Segunda", order: 2 },
  });
  const client = await prisma.client.create({
    data: {
      organizationId: org.id,
      clientCode: `M-${mark}`.slice(0, 20),
      firstName: "Ana",
      lastName: `Prueba ${mark}`.slice(0, 40),
      status: "ACTIVE",
    },
  });
  async function cleanup() {
    await prisma.organization.delete({ where: { id: org.id } }).catch(() => undefined);
    for (const id of users) await prisma.user.delete({ where: { id } }).catch(() => undefined);
  }
  return { org, owner, staff, viewer, member, service, stage, stage2, client, cleanup };
}

/** Error de una llamada como nombre de clase, u "ok". */
export async function errorName(fn: () => Promise<unknown>): Promise<string> {
  try {
    await fn();
    return "ok";
  } catch (error) {
    return (error as Error).name ?? "Error";
  }
}

export function meta(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
