import type { Metadata } from "next";
import { ClientDetailPanel } from "@/src/components/clients/client-detail-panel";
import { firstParam, type SearchParams } from "@/src/server/page-helpers";

export const metadata: Metadata = {
  title: "Cliente",
};

export default async function ClientSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: SearchParams;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const caseId = firstParam(sp, "caseId");
  return <ClientDetailPanel clientId={clientId} caseId={caseId} />;
}
