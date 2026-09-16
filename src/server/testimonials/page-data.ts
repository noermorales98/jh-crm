import { prisma } from "@/src/lib/db";
import type { OrganizationContext } from "@/src/server/auth/guards";
import type { PortalContext } from "@/src/server/portal";
import type { TestimonialView } from "@/src/components/testimonials/testimonial-list";
import { hasTestimonialConsent, listTestimonials } from "./index";

export async function testimonialPageData(
  ctx: OrganizationContext | PortalContext,
  clientId?: string,
) {
  const scopedClientId = "accessId" in ctx ? ctx.clientId : clientId;
  const [records, cases] = await Promise.all([
    listTestimonials(ctx, scopedClientId),
    scopedClientId
      ? prisma.serviceCase.findMany({
          where: {
            organizationId: ctx.organizationId,
            clientId: scopedClientId,
            archivedAt: null,
          },
          select: {
            id: true,
            caseNumber: true,
            service: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);
  const rows: TestimonialView[] = records.map((row) => ({
    id: row.id,
    clientId: row.clientId,
    clientName: [row.client.firstName, row.client.lastName]
      .filter(Boolean)
      .join(" "),
    displayName: row.displayName,
    body: row.body,
    rating: row.rating,
    serviceCaseId: row.serviceCaseId,
    caseNumber: row.serviceCase?.caseNumber ?? null,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    publishedAt: row.publishedAt?.toISOString() ?? null,
    consentActive: hasTestimonialConsent(row),
    consentSignerName: row.consentSignerName,
    consentEvidence: "accessId" in ctx ? null : row.consentEvidence,
    consentGrantedAt: row.consentGrantedAt?.toISOString() ?? null,
    consentRevokedAt: row.consentRevokedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }));
  return {
    rows,
    cases: cases.map((c) => ({
      id: c.id,
      label: `${c.caseNumber} · ${c.service.name}`,
    })),
  };
}
