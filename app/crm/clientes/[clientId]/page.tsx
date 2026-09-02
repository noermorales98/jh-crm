import type { Metadata } from "next";
import { ClientDetailPanel } from "@/src/components/clients/client-detail-panel";

export const metadata: Metadata = {
  title: "Cliente",
};

export default async function ClientSummaryPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ClientDetailPanel clientId={clientId} />;
}
