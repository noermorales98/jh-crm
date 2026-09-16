import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import { DomainError } from "@/src/server/errors";
import { Card, CardHeader, CardBody } from "@/src/components/ui";
import { TestimonialForm } from "@/src/components/testimonials/testimonial-form";
import { TestimonialList } from "@/src/components/testimonials/testimonial-list";
import { testimonialPageData } from "@/src/server/testimonials/page-data";
import { ClientHeader } from "../client-header";

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
  const manage = can(ctx.role, "testimonials.manage");
  return (
    <div>
      <ClientHeader client={detail.client} />
      {manage ? (
        <Card className="mb-4">
          <CardHeader
            title="Nuevo testimonio"
            description="Registra las palabras del cliente. El consentimiento, la aprobación y la publicación se completan por separado."
          />
          <CardBody>
            <TestimonialForm
              clientId={clientId}
              defaultName={detail.client.firstName}
              cases={cases}
            />
          </CardBody>
        </Card>
      ) : null}
      <TestimonialList
        rows={rows}
        cases={cases}
        manage={manage}
        publish={can(ctx.role, "testimonials.publish")}
      />
    </div>
  );
}
