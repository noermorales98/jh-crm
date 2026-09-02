import type { Metadata } from "next";
import { QuoteDetailPanel } from "@/src/components/quotes/quote-detail-panel";

export const metadata: Metadata = {
  title: "Detalle de cotización",
};

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  return <QuoteDetailPanel quoteId={quoteId} />;
}
