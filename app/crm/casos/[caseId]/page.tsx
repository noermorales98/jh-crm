import type { Metadata } from "next";
import { CaseDetailPanel } from "@/src/components/cases/case-detail-panel";

export const metadata: Metadata = {
  title: "Caso",
};

export default async function CaseSummaryPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  return <CaseDetailPanel caseId={caseId} />;
}
