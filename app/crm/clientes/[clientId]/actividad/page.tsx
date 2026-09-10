import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import * as clientService from "@/src/server/clients";
import { DomainError } from "@/src/server/errors";
import { ActivityTimeline } from "@/src/components/clients/activity-timeline";
import { ClientHeader } from "../client-header";

export const metadata: Metadata = {
  title: "Actividad del cliente",
};

export default async function ClientActivityPage({
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

  const { client, timeline } = detail;

  return (
    <div>
      <ClientHeader client={client} />
      <ActivityTimeline
        clientId={client.id}
        clientName={`${client.firstName} ${client.lastName}`.trim()}
        events={timeline}
      />
    </div>
  );
}
