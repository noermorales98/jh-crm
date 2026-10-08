"use server";

import { z } from "zod";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import {
  DomainError,
  actionFail,
  actionOk,
  isNextControlError,
  type ActionResult,
} from "@/src/server/errors";
import { cuidSchema } from "@/src/lib/validation/common";
import * as taskService from "@/src/server/tasks";
import * as documentService from "@/src/server/documents";
import * as paymentService from "@/src/server/payments";
import * as notesService from "@/src/server/notes";
import { testimonialPageData } from "@/src/server/testimonials/page-data";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import { listMemberOptions } from "@/src/server/page-helpers";
import { listVerticalServiceOptions } from "@/src/server/services/verticals";
import { prisma } from "@/src/lib/db";

const panelSchema = z.enum([
  "services",
  "tasks",
  "documents",
  "payments",
  "notes",
  "testimonials",
  "activity",
]);

export type ClientOpsPanel = z.infer<typeof panelSchema>;

type ServiceCaseRow = {
  id: string;
  caseNumber: string;
  status: string;
  startedAt: Date;
  nextActionAt: Date | null;
  service: { name: string; code: string | null };
  stage: { name: string; color: string };
  creditCase: { id: string } | null;
};

type OrphanCaseRow = {
  id: string;
  caseCode: string;
  state: string;
  openedAt: Date;
  nextReviewAt: Date | null;
  stage: { name: string; color: string };
};

type ActivityEventRow = {
  id: string;
  type: string;
  description: string;
  createdAt: Date;
  caseId: string | null;
  roundId: string | null;
  serviceCaseId: string | null;
  metadata: unknown;
  actor: { name: string | null; email: string | null } | null;
  case: { caseCode: string; summary: string | null } | null;
  serviceCase: {
    caseNumber: string;
    notes: string | null;
    service: { name: string } | null;
  } | null;
  round: { roundNumber: number } | null;
};

export type ClientOpsPanelPayload =
  | {
      panel: "services";
      clientArchived: boolean;
      serviceCases: ServiceCaseRow[];
      orphanCases: OrphanCaseRow[];
      canManage: boolean;
      services: Awaited<ReturnType<typeof listVerticalServiceOptions>>;
      members: Awaited<ReturnType<typeof listMemberOptions>>;
    }
  | {
      panel: "tasks";
      tasks: Awaited<ReturnType<typeof taskService.listTasks>>["items"];
      members: Awaited<ReturnType<typeof listMemberOptions>>;
      canManage: boolean;
      timezone: string;
      cases: { id: string; caseCode: string }[];
    }
  | {
      panel: "documents";
      documents: Awaited<
        ReturnType<typeof documentService.listDocuments>
      >["items"];
      canUpload: boolean;
    }
  | {
      panel: "payments";
      payments: Array<{
        id: string;
        amount: number;
        currency: string;
        method: string;
        status: string;
        dueAt: Date | string | null;
        receivedAt: Date | string | null;
        case: { id: string; caseCode: string } | null;
      }>;
      canRegister: boolean;
      cases: { id: string; caseCode: string }[];
    }
  | {
      panel: "notes";
      notes: Awaited<ReturnType<typeof notesService.listClientNotes>>;
      canEdit: boolean;
    }
  | {
      panel: "testimonials";
      defaultName: string;
      rows: NonNullable<
        Awaited<ReturnType<typeof testimonialPageData>>
      >["rows"];
      cases: NonNullable<
        Awaited<ReturnType<typeof testimonialPageData>>
      >["cases"];
      manage: boolean;
      publish: boolean;
    }
  | {
      panel: "activity";
      events: ActivityEventRow[];
    };

async function assertClientInOrg(organizationId: string, clientId: string) {
  const client = await prisma.client.findFirst({
    where: { id: clientId, organizationId },
    select: { id: true, status: true, firstName: true },
  });
  if (!client) throw new DomainError("Cliente no encontrado.");
  return client;
}

/**
 * Carga bajo demanda los datos de un panel del hub (modales cerrados en SSR).
 */
export async function loadClientOpsPanelAction(
  clientId: string,
  panel: ClientOpsPanel,
): Promise<ActionResult<ClientOpsPanelPayload>> {
  try {
    const id = cuidSchema.parse(clientId);
    const kind = panelSchema.parse(panel);
    const ctx = await requireOrganization();

    if (kind === "services") {
      const canManage = can(ctx.role, "cases.manage");
      const [client, serviceCases, cases, members, services] = await Promise.all([
        assertClientInOrg(ctx.organizationId, id),
        prisma.serviceCase.findMany({
          where: { clientId: id, organizationId: ctx.organizationId },
          select: {
            id: true,
            caseNumber: true,
            status: true,
            startedAt: true,
            nextActionAt: true,
            service: { select: { name: true, code: true } },
            stage: { select: { name: true, color: true } },
            creditCase: { select: { id: true } },
          },
          orderBy: { startedAt: "desc" },
          take: 20,
        }),
        prisma.creditCase.findMany({
          where: { clientId: id, organizationId: ctx.organizationId },
          select: {
            id: true,
            caseCode: true,
            state: true,
            openedAt: true,
            nextReviewAt: true,
            stage: { select: { name: true, color: true } },
          },
          orderBy: { openedAt: "desc" },
          take: 20,
        }),
        canManage
          ? listMemberOptions(ctx)
          : Promise.resolve([] as Awaited<ReturnType<typeof listMemberOptions>>),
        canManage
          ? listVerticalServiceOptions(ctx.organizationId)
          : Promise.resolve(
              [] as Awaited<ReturnType<typeof listVerticalServiceOptions>>,
            ),
      ]);
      const linkedCreditIds = new Set(
        serviceCases
          .map((sc) => sc.creditCase?.id)
          .filter((x): x is string => Boolean(x)),
      );
      const orphanCases = cases.filter((c) => !linkedCreditIds.has(c.id));
      return actionOk({
        panel: "services",
        clientArchived: client.status === "ARCHIVED",
        serviceCases,
        orphanCases,
        canManage,
        services,
        members,
      });
    }

    if (kind === "tasks") {
      const canManage = can(ctx.role, "tasks.manage");
      const [tasks, members, timezone, cases] = await Promise.all([
        taskService.listTasks(ctx, { clientId: id, limit: 50 }),
        canManage || can(ctx.role, "clients.edit")
          ? listMemberOptions(ctx)
          : Promise.resolve([] as Awaited<ReturnType<typeof listMemberOptions>>),
        getOrganizationTimezone(ctx.organizationId),
        prisma.creditCase.findMany({
          where: { clientId: id, organizationId: ctx.organizationId },
          select: { id: true, caseCode: true },
          orderBy: { openedAt: "desc" },
          take: 20,
        }),
      ]);
      return actionOk({
        panel: "tasks",
        tasks: tasks.items,
        members,
        canManage,
        timezone,
        cases,
      });
    }

    if (kind === "documents") {
      const documents = await documentService.listDocuments(ctx, {
        clientId: id,
        limit: 50,
      });
      return actionOk({
        panel: "documents",
        documents: documents.items,
        canUpload: can(ctx.role, "documents.upload"),
      });
    }

    if (kind === "payments") {
      const [payments, cases] = await Promise.all([
        paymentService.listPayments(ctx, { clientId: id, limit: 50 }),
        prisma.creditCase.findMany({
          where: { clientId: id, organizationId: ctx.organizationId },
          select: { id: true, caseCode: true },
          orderBy: { openedAt: "desc" },
          take: 20,
        }),
      ]);
      return actionOk({
        panel: "payments",
        payments: payments.items.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          currency: p.currency,
          method: p.method,
          status: p.status,
          dueAt: p.dueAt,
          receivedAt: p.receivedAt,
          case: p.case ? { id: p.case.id, caseCode: p.case.caseCode } : null,
        })),
        canRegister: can(ctx.role, "payments.register"),
        cases,
      });
    }

    if (kind === "notes") {
      const notes = await notesService.listClientNotes(ctx, id, { limit: 80 });
      return actionOk({
        panel: "notes",
        notes,
        canEdit: can(ctx.role, "clients.edit"),
      });
    }

    if (kind === "testimonials") {
      if (!can(ctx.role, "testimonials.view")) {
        throw new Error("No tienes permiso para ver testimonios.");
      }
      const data = await testimonialPageData(ctx, id);
      const client = await prisma.client.findFirst({
        where: { id, organizationId: ctx.organizationId },
        select: { firstName: true },
      });
      return actionOk({
        panel: "testimonials",
        defaultName: client?.firstName ?? "",
        rows: data.rows,
        cases: data.cases,
        manage: can(ctx.role, "testimonials.manage"),
        publish: can(ctx.role, "testimonials.publish"),
      });
    }

    // activity
    await assertClientInOrg(ctx.organizationId, id);
    const events = await prisma.activityLog.findMany({
      where: { clientId: id, organizationId: ctx.organizationId },
      select: {
        id: true,
        type: true,
        description: true,
        createdAt: true,
        caseId: true,
        roundId: true,
        serviceCaseId: true,
        metadata: true,
        actor: { select: { name: true, email: true } },
        case: { select: { caseCode: true, summary: true } },
        serviceCase: {
          select: {
            caseNumber: true,
            notes: true,
            service: { select: { name: true } },
          },
        },
        round: { select: { roundNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
    });
    return actionOk({
      panel: "activity",
      events,
    });
  } catch (error) {
    if (isNextControlError(error)) throw error;
    return actionFail(error);
  }
}
