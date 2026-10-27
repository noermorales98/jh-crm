import { notFound, redirect } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { prisma } from "@/src/lib/db";
import type { SearchParams } from "@/src/server/page-helpers";
import { caseHref } from "@/src/lib/routes/case-routes";

/** Compat: /crm/casos/:caseId/* → /crm/clientes/:clientId/servicios/:caseId/*. */
export default async function LegacyCaseRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string; rest?: string[] }>;
  searchParams: SearchParams;
}) {
  const { caseId, rest } = await params;
  const sp = await searchParams;
  const ctx = await requireOrganization();
  const creditCase = await prisma.creditCase.findFirst({
    where: { id: caseId, organizationId: ctx.organizationId },
    select: { clientId: true },
  });
  if (!creditCase) notFound();

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v != null) query.append(key, v);
    }
  }
  const sub = rest?.length ? `/${rest.map(encodeURIComponent).join("/")}` : "";
  const qs = query.toString();
  redirect(`${caseHref(creditCase.clientId, caseId, sub)}${qs ? `?${qs}` : ""}`);
}
