import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import * as caseService from "@/src/server/cases";
import { DomainError } from "@/src/server/errors";
import {
  ButtonLink,
  Card,
  CardHeader,
  EmptyState,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate, formatMoney } from "@/src/lib/format";
import { CaseHeader } from "../case-header";

export const metadata: Metadata = {
  title: "Cotizaciones del caso",
};

export default async function CaseQuotesPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof caseService.getCaseDetail>>;
  try {
    detail = await caseService.getCaseDetail(ctx, caseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { case: creditCase, quotes } = detail;

  return (
    <div>
      <CaseHeader
        creditCase={creditCase}
        actions={
          <ButtonLink
            href={`/crm/cotizaciones/nueva?clientId=${creditCase.client.id}&caseId=${creditCase.id}`}
            variant="secondary"
            size="sm"
          >
            Nueva cotización
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader
          title="Cotizaciones del caso"
          description="Vista de solo lectura. La creación y gestión completa está en la sección Cotizaciones."
        />
        {quotes.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Sin cotizaciones"
            description="Este caso aún no tiene cotizaciones ligadas."
            action={
              <ButtonLink
                href={`/crm/cotizaciones?clientId=${creditCase.client.id}`}
                variant="secondary"
                size="sm"
              >
                Ir a Cotizaciones
              </ButtonLink>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Folio</TH>
                <TH>Estado</TH>
                <TH>Total</TH>
                <TH>Emitida</TH>
              </TR>
            </THead>
            <TBody>
              {quotes.map((quote) => (
                <TR key={quote.id}>
                  <TD>
                    <Link
                      href={`/crm/cotizaciones/${quote.id}`}
                      className="font-medium text-action-primary hover:text-action-secondary"
                    >
                      {quote.folio}
                    </Link>
                  </TD>
                  <TD>
                    <StatusPill domain="quote" value={quote.status} />
                  </TD>
                  <TD className="tabular-nums">
                    {formatMoney(quote.total, quote.currency)}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {formatDate(quote.issuedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
