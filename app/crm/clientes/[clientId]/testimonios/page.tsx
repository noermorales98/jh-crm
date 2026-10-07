import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import { DomainError } from "@/src/server/errors";
import { clientFullName } from "@/src/server/page-helpers";
import { testimonialPageData } from "@/src/server/testimonials/page-data";
import { ClientTestimonialsPanel } from "@/src/components/clients/client-testimonials-panel";
import { AgencyClientShell } from "@/src/components/clients/agency-client-shell";

export const metadata: Metadata = { title: "Testimonios del cliente" };

export default async function ClientTestimonialsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requirePermission("testimonials.view");
  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }
  const { rows, cases } = await testimonialPageData(ctx, clientId);

  return (
    <AgencyClientShell
      clientId={detail.client.id}
      fullName={clientFullName(detail.client)}
      status={detail.client.status}
      title="Testimonios"
    >
      <ClientTestimonialsPanel
        clientId={clientId}
        defaultName={detail.client.firstName}
        rows={rows}
        cases={cases}
        manage={can(ctx.role, "testimonials.manage")}
        publish={can(ctx.role, "testimonials.publish")}
      />
    </AgencyClientShell>
  );
}
