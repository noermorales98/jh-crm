import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import { caseHref } from "@/src/lib/routes/case-routes";

/** El caso debe pertenecer al cliente de la URL; si no, va a su cliente real. */
export default async function ClientCaseLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clientId: string; caseId: string }>;
}) {
  const { clientId, caseId } = await params;
  const ctx = await requireOrganization();
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { clientId: true },
  });
  if (!creditCase) notFound();
  if (creditCase.clientId !== clientId) {
    redirect(caseHref(creditCase.clientId, caseId));
  }
  return children;
}
