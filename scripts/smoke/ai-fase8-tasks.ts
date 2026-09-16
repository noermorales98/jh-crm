/**
 * Smoke AI-003…005: helpers cargan, respetan sanitize y fallan limpio sin API key.
 * Uso: npx tsx --env-file=.env.local scripts/smoke/ai-fase8-tasks.ts
 */
import { PrismaClient } from "@prisma/client";
import { createCreditCase } from "../../src/server/cases";
import {
  extractNoteActions,
  suggestNextAction,
  summarizeCase,
} from "../../src/server/ai/tasks";
import { isOpenRouterConfigured } from "../../src/lib/ai/openrouter";
import { DomainError } from "../../src/server/errors";
import type { OrganizationContext } from "../../src/server/auth/guards";

const MARK = `ai8-${Date.now()}`;
let checks = 0;
function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  checks++;
  console.log(`  ✓ ${label}`);
}

async function main() {
  const prisma = new PrismaClient();
  let clientId: string | null = null;
  let caseId: string | null = null;
  let serviceCaseId: string | null = null;

  try {
    const member = await prisma.organizationMember.findFirstOrThrow({
      where: { role: "OWNER" },
      orderBy: { createdAt: "asc" },
    });
    const ctx: OrganizationContext = {
      userId: member.userId,
      organizationId: member.organizationId,
      role: "OWNER",
    };

    console.log("\n[AI-003…005] Tareas de IA");

    const client = await prisma.client.create({
      data: {
        organizationId: ctx.organizationId,
        clientCode: `C-${MARK}`.slice(0, 20),
        firstName: "AI8",
        lastName: MARK,
        status: "ACTIVE",
        assignedToId: member.userId,
      },
    });
    clientId = client.id;
    const created = await createCreditCase(ctx, {
      clientId: client.id,
      assignedToId: member.userId,
      summary: `Smoke AI8 ${MARK}`,
    });
    caseId = created.id;
    serviceCaseId = created.serviceCaseId;

    if (!isOpenRouterConfigured()) {
      await summarizeCase(ctx, caseId).then(
        () => {
          throw new Error("debía fallar sin API key");
        },
        (error) => {
          check(
            "sin OpenRouter → DomainError",
            error instanceof DomainError &&
              error.message.includes("OpenRouter"),
          );
        },
      );
    } else {
      const summary = await summarizeCase(ctx, caseId);
      check(
        "summarizeCase devuelve texto",
        Boolean(
          summary &&
            typeof summary === "object" &&
            "summary" in summary &&
            typeof (summary as { summary: string }).summary === "string",
        ),
      );
      const next = await suggestNextAction(ctx, caseId);
      check(
        "suggestNextAction etiqueta sugerencia",
        Boolean(
          next &&
            typeof next === "object" &&
            "label" in next &&
            String((next as { label: string }).label).includes("Sugerencia"),
        ),
      );
      const extracted = await extractNoteActions(
        ctx,
        "Llamar al cliente mañana y pedir ID + comprobante de domicilio.",
        caseId,
      );
      check(
        "extractNoteActions pide confirmación",
        Boolean(
          extracted &&
            typeof extracted === "object" &&
            "label" in extracted &&
            String((extracted as { label: string }).label).includes("confirmar"),
        ),
      );
      check(
        "extractNoteActions incluye clientId",
        Boolean(
          extracted &&
            typeof extracted === "object" &&
            "clientId" in extracted &&
            (extracted as { clientId: string | null }).clientId === clientId,
        ),
      );
    }

    // AI-005 apply (domain path — misma lógica que applyAiProposalAction)
    const { createTask } = await import("../../src/server/tasks");
    const { writeActivityLog } = await import("../../src/server/activity");
    const { toActivityContext } = await import("../../src/server/context");
    const task = await createTask(ctx, {
      title: `AI5 smoke task ${MARK}`,
      description: "Aplicada desde propuesta",
      type: "FOLLOW_UP",
      clientId,
      caseId,
      assignedToId: ctx.userId,
    });
    check("apply proposal → task", Boolean(task.id));
    const activity = await writeActivityLog(toActivityContext(ctx), {
      type: "NOTE",
      description: `AI5 smoke note ${MARK}`,
      clientId,
      caseId,
      metadata: { source: "ai_proposal", kind: "activity" },
    });
    check("apply proposal → activity", Boolean(activity.id));
    const taskRow = await prisma.task.findFirst({
      where: { id: task.id, clientId },
    });
    const activityRow = await prisma.activityLog.findFirst({
      where: { id: activity.id, clientId, type: "NOTE" },
    });
    check("task row persistida", Boolean(taskRow));
    check("activity row persistida", Boolean(activityRow));

    console.log(`AI-FASE8: ${checks}/${checks} OK`);
  } finally {
    console.log("\n[cleanup]");
    if (clientId) {
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
