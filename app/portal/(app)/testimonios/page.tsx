import type { Metadata } from "next";
import { prisma } from "@/src/lib/db";
import { requirePortalSession } from "@/src/server/auth/guards";
import { Card, CardHeader, CardBody, PageHeader } from "@/src/components/ui";
import { TestimonialForm } from "@/src/components/testimonials/testimonial-form";
import { TestimonialList } from "@/src/components/testimonials/testimonial-list";
import { testimonialPageData } from "@/src/server/testimonials/page-data";

export const metadata: Metadata = { title: "Testimonios" };
export default async function PortalTestimonialsPage() {
  const ctx = await requirePortalSession();
  const client = await prisma.client.findFirstOrThrow({
    where: { id: ctx.clientId, organizationId: ctx.organizationId },
    select: { firstName: true, lastName: true },
  });
  const { rows, cases } = await testimonialPageData(ctx);
  return (
    <div>
      <PageHeader
        title="Tu experiencia"
        description="Comparte tu experiencia con JH Multiservices. El equipo revisará tu testimonio antes de publicarlo. Puedes retirar tu consentimiento en cualquier momento."
      />
      <Card className="mb-4">
        <CardHeader title="Enviar testimonio" />
        <CardBody>
          <TestimonialForm
            clientId={ctx.clientId}
            defaultName={[client.firstName, client.lastName]
              .filter(Boolean)
              .join(" ")}
            cases={cases}
            portal
          />
        </CardBody>
      </Card>
      <TestimonialList
        rows={rows}
        cases={cases}
        manage
        publish={false}
        portal
      />
    </div>
  );
}
