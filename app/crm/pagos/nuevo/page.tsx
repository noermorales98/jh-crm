import type { Metadata } from "next";
import { requirePermission } from "@/src/server/auth/guards";
import * as clientService from "@/src/server/clients";
import * as caseService from "@/src/server/cases";
import * as quoteService from "@/src/server/quotes";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import { ymdInZone } from "@/src/lib/format/dates";
import {
  clientFullName,
  firstParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import { Card, CardBody, PageHeader } from "@/src/components/ui";
import { QUOTE_STATUS_LABELS } from "@/src/lib/labels";
import { PaymentForm } from "@/src/components/payments/payment-form";

export const metadata: Metadata = {
  title: "Registrar pago",
};

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requirePermission("payments.register");
  const sp = await searchParams;

  const [clients, casesResult, quotesResult, timezone] = await Promise.all([
    clientService.listClients(ctx, { limit: 100 }),
    caseService.listCases(ctx, { limit: 100 }),
    quoteService.listQuotes(ctx, { limit: 100 }),
    getOrganizationTimezone(ctx.organizationId),
  ]);

  const clientOptions = clients.items
    .filter((c) => c.status !== "ARCHIVED")
    .map((c) => ({ id: c.id, label: `${clientFullName(c)} (${c.clientCode})` }));

  const caseOptions = casesResult.items
    .filter((c) => c.state !== "CANCELLED")
    .map((c) => ({
      id: c.id,
      caseCode: c.caseCode,
      clientId: c.client.id,
    }));

  const quoteOptions = quotesResult.items
    .filter((q) => !["CANCELLED", "REJECTED", "PAID"].includes(q.status))
    .map((q) => ({
      id: q.id,
      folio: q.folio,
      clientId: q.client.id,
      caseId: q.case?.id ?? null,
      total: q.total.toString(),
      statusLabel: QUOTE_STATUS_LABELS[q.status] ?? q.status,
    }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Registrar pago"
        description="Registro manual de un pago. Un pago recibido emite su recibo automáticamente; uno pendiente solo agenda el compromiso."
      />
      <Card>
        <CardBody>
          <PaymentForm
            clients={clientOptions}
            cases={caseOptions}
            quotes={quoteOptions}
            initialClientId={firstParam(sp, "clientId") ?? ""}
            initialCaseId={firstParam(sp, "caseId") ?? ""}
            initialQuoteId={firstParam(sp, "quoteId") ?? ""}
            defaultReceivedAt={ymdInZone(new Date(), timezone)}
          />
        </CardBody>
      </Card>
    </div>
  );
}
