import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requirePermission } from "@/src/server/auth/guards";
import * as clientService from "@/src/server/clients";
import * as caseService from "@/src/server/cases";
import * as catalog from "@/src/server/services";
import * as quoteService from "@/src/server/quotes";
import * as configService from "@/src/server/config";
import { DomainError } from "@/src/server/errors";
import {
  clientFullName,
  firstParam,
  toDateInputValue,
  type SearchParams,
} from "@/src/server/page-helpers";
import { PageHeader } from "@/src/components/ui";
import { CASE_STATE_LABELS } from "@/src/lib/labels";
import { QuoteForm } from "@/src/components/quotes/quote-form";

export const metadata: Metadata = {
  title: "Nueva cotización",
};

export default async function NewQuotePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requirePermission("quotes.manage");
  const sp = await searchParams;

  const preClientId = firstParam(sp, "clientId") ?? "";
  const preCaseId = firstParam(sp, "caseId") ?? "";
  const editId = firstParam(sp, "edit");

  const [clients, casesResult, services, packages, settings] = await Promise.all([
    clientService.listClients(ctx, { limit: 100 }),
    caseService.listCases(ctx, { limit: 100 }),
    catalog.listServices(ctx),
    catalog.listPackages(ctx),
    configService.getSettings(ctx),
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
      stateLabel: CASE_STATE_LABELS[c.state] ?? c.state,
    }));

  const serviceOptions = services.map((s) => ({
    id: s.id,
    name: s.name,
    defaultPrice: Number(s.defaultPrice.toString()),
  }));

  const packageOptions = packages.map((p) => ({
    id: p.id,
    name: p.name,
    defaultPrice: Number(p.defaultPrice.toString()),
  }));

  // Edición de un borrador existente (?edit=<quoteId>).
  let editQuote: Awaited<ReturnType<typeof quoteService.getQuoteDetail>> | null =
    null;
  if (editId) {
    try {
      editQuote = await quoteService.getQuoteDetail(ctx, editId);
    } catch (error) {
      if (error instanceof DomainError) notFound();
      throw error;
    }
    if (editQuote.status !== "DRAFT") notFound();
  }

  const initial = editQuote
    ? {
        clientId: editQuote.client.id,
        caseId: editQuote.case?.id ?? "",
        items: editQuote.items.map((item, index) => ({
          key: index,
          kind: (item.serviceId
            ? "service"
            : item.packageId
              ? "package"
              : "manual") as "service" | "package" | "manual",
          refId: item.serviceId ?? item.packageId ?? "",
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          discount: item.discountAmount.toString(),
        })),
        validUntil: toDateInputValue(editQuote.validUntil),
        notes: editQuote.notes ?? "",
        terms: editQuote.terms ?? "",
        taxRate: editQuote.taxRate.toString(),
      }
    : undefined;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={editQuote ? `Editar ${editQuote.folio}` : "Nueva cotización"}
        description={
          editQuote
            ? "Solo las cotizaciones en borrador son editables. El servidor recalcula los totales."
            : "Construye la cotización desde el catálogo o con ítems manuales. El folio se genera al guardar."
        }
      />
      <QuoteForm
        mode={editQuote ? "edit" : "create"}
        quoteId={editQuote?.id}
        clients={clientOptions}
        cases={caseOptions}
        services={serviceOptions}
        packages={packageOptions}
        defaultTaxRate={settings.defaultTaxRate.toString()}
        defaultTerms={settings.defaultTerms ?? ""}
        initialClientId={preClientId}
        initialCaseId={preCaseId}
        initial={initial}
      />
    </div>
  );
}
