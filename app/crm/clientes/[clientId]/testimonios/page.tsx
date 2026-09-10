import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MessageSquareQuote } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import * as clientService from "@/src/server/clients";
import { DomainError } from "@/src/server/errors";
import { Card, CardHeader, EmptyState } from "@/src/components/ui";
import { ClientHeader } from "../client-header";

export const metadata: Metadata = {
  title: "Testimonios del cliente",
};

/**
 * CL-002 tab presente; captura/aprobación/publicación es Epic 9 (P1).
 * Sin tabla testimonials en schema v1.
 */
export default async function ClientTestimonialsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client } = detail;

  return (
    <div>
      <ClientHeader client={client} />

      <Card>
        <CardHeader
          title="Testimonios"
          description="Solicitud, aprobación y publicación (Epic 9)."
        />
        <EmptyState
          icon={MessageSquareQuote}
          title="Próximamente"
          description="Los testimonios no se publican solos. Cuando el módulo esté listo, podrás solicitar y aprobar testimonios desde esta ficha."
        />
      </Card>
    </div>
  );
}
