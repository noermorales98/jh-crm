"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QuoteForm } from "@/src/components/quotes/quote-form";
import { suggestQuoteLinesFromReport } from "@/src/actions/credit-reports";
import type { QuoteFormInitial } from "@/src/components/quotes/quote-form";

export function ClientQuoteHubPanel({
  clientId,
  clientLabel,
  caseId,
  reportId,
  existingQuoteId,
  quoteStatusLabel,
  services,
  packages,
  defaultTaxRate,
  defaultTerms,
}: {
  clientId: string;
  clientLabel: string;
  caseId: string | null;
  reportId: string | null;
  existingQuoteId: string | null;
  quoteStatusLabel: string;
  services: { id: string; name: string; defaultPrice: number }[];
  packages: { id: string; name: string; defaultPrice: number }[];
  defaultTaxRate: string;
  defaultTerms: string;
}) {
  const router = useRouter();
  const [initial, setInitial] = useState<QuoteFormInitial | null>(null);
  const [ready, setReady] = useState(Boolean(existingQuoteId));
  const [error, setError] = useState<string | null>(null);

  const clients = useMemo(
    () => [{ id: clientId, label: clientLabel }],
    [clientId, clientLabel],
  );
  const cases = useMemo(
    () =>
      caseId
        ? [
            {
              id: caseId,
              caseCode: "",
              clientId,
              stateLabel: "",
              label: "Caso activo",
            },
          ]
        : [],
    [caseId, clientId],
  );

  useEffect(() => {
    if (existingQuoteId) {
      setReady(true);
      return;
    }
    let cancelled = false;
    void suggestQuoteLinesFromReport({ clientId, reportId }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setInitial({
          clientId,
          caseId: caseId ?? "",
          items: [
            {
              key: 0,
              kind: "manual",
              refId: "",
              description: "Asesoría",
              quantity: "1",
              unitPrice: "120",
              discount: "0",
            },
          ],
          validUntil: "",
          notes: "",
          terms: defaultTerms,
          taxRate: defaultTaxRate,
        });
        setReady(true);
        return;
      }
      setInitial({
        clientId,
        caseId: caseId ?? "",
        items: res.data.map((line, index) => ({
          key: index,
          kind: "manual" as const,
          refId: "",
          description: `${line.description}${line.detail ? ` — ${line.detail}` : ""}`.slice(
            0,
            200,
          ),
          quantity: String(line.quantity),
          unitPrice: line.unitPrice.toFixed(2),
          discount: "0",
        })),
        validUntil: "",
        notes:
          "Cotización de referencia a partir de elementos negativos del reporte.",
        terms: defaultTerms,
        taxRate: defaultTaxRate,
      });
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [
    existingQuoteId,
    clientId,
    reportId,
    caseId,
    defaultTerms,
    defaultTaxRate,
  ]);

  if (!ready) {
    return (
      <p className="py-6 text-center text-[13px] text-text-secondary">
        Preparando cotización…
      </p>
    );
  }

  if (existingQuoteId) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-[13px] text-text-secondary">
          Estado: <strong className="text-ink">{quoteStatusLabel}</strong>
        </p>
        <p className="text-[13px] text-text-secondary">
          Ya hay una cotización. Ábrela para editar o enviar.
        </p>
        <Link
          href={`/crm/cotizaciones/${existingQuoteId}`}
          className="inline-flex rounded-control bg-action-primary px-4 py-2 text-sm font-medium text-action-primary-foreground"
        >
          Abrir cotización
        </Link>
        <p className="text-[12px] text-text-secondary">
          O{" "}
          <Link
            href={`/crm/cotizaciones/nueva?clientId=${clientId}${
              caseId ? `&caseId=${caseId}` : ""
            }`}
            className="font-medium text-action-primary"
          >
            crear otra
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {error ? (
        <p className="text-[12px] text-warning-ink">
          No se pudieron sugerir líneas desde el reporte; empieza con asesoría.
        </p>
      ) : (
        <p className="text-[12px] text-text-secondary">
          Líneas precalculadas desde negativos del reporte. Ajusta y guarda.
        </p>
      )}
      {initial ? (
        <QuoteForm
          mode="create"
          clients={clients}
          cases={cases}
          services={services}
          packages={packages}
          defaultTaxRate={defaultTaxRate}
          defaultTerms={defaultTerms}
          initialClientId={clientId}
          initialCaseId={caseId ?? ""}
          initial={initial}
          embedded
          onSaved={(id) => {
            router.refresh();
            window.location.href = `/crm/cotizaciones/${id}`;
          }}
        />
      ) : null}
    </div>
  );
}
