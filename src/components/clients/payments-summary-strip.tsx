"use client";

import { useState } from "react";
import Link from "next/link";
import type { PaymentRecentDto } from "@/src/server/clients/overview";
import { formatDate, formatMoney } from "@/src/lib/format";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { PaymentPeekModal } from "@/src/components/clients/payment-peek-modal";
import { QuoteStripeCheckoutActions } from "@/src/components/payments/quote-stripe-checkout-actions";
import { ButtonLink } from "@/src/components/ui";

export function PaymentsSummaryStrip({
  clientId,
  clientPhone,
  quoteTotal,
  received,
  pending,
  currency,
  recent,
  payableQuote,
  canRegisterPayment,
}: {
  clientId: string;
  clientPhone?: string | null;
  quoteTotal: number | null;
  received: number;
  pending: number;
  currency: string;
  recent: PaymentRecentDto[];
  payableQuote?: { id: string; folio: string; status: string } | null;
  canRegisterPayment?: boolean;
}) {
  const [peekId, setPeekId] = useState<string | null>(null);

  return (
    <div className="space-y-2 rounded-control border border-border-subtle/50 bg-surface-panel px-2.5 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
          Pagos
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {canRegisterPayment ? (
            <ButtonLink
              href={`/crm/pagos/nuevo?clientId=${clientId}`}
              variant="ghost"
              size="sm"
            >
              Registrar
            </ButtonLink>
          ) : null}
          <Link
            href={`/crm/pagos?clientId=${clientId}`}
            className="text-[11px] font-medium text-action-primary hover:text-action-secondary"
          >
            Ver todos
          </Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-3 text-xs tabular-nums">
        <span>
          <span className="text-text-secondary">Acuerdo </span>
          <span className="font-medium text-ink">
            {quoteTotal != null ? formatMoney(quoteTotal, currency) : "—"}
          </span>
        </span>
        <span>
          <span className="text-text-secondary">Pagado </span>
          <span className="font-medium text-ink">
            {formatMoney(received, currency)}
          </span>
        </span>
        <span>
          <span className="text-text-secondary">Pendiente </span>
          <span className="font-medium text-ink">
            {formatMoney(pending, currency)}
          </span>
        </span>
      </div>
      {payableQuote ? (
        <div className="rounded-control border border-border-subtle/40 bg-surface-app/60 px-2 py-1.5">
          <p className="mb-1 text-[11px] text-text-secondary">
            Link de pago · {payableQuote.folio}
          </p>
          <QuoteStripeCheckoutActions
            quoteId={payableQuote.id}
            clientPhone={clientPhone}
            linkLabel={`Cotización ${payableQuote.folio}`}
            compact
          />
        </div>
      ) : null}
      {recent.length === 0 ? (
        <p className="text-xs text-text-secondary">Sin pagos registrados.</p>
      ) : (
        <ul className="divide-y divide-border-subtle/70">
          {recent.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setPeekId(p.id)}
                className="flex w-full items-center justify-between gap-2 py-1 text-left text-xs hover:bg-nav-hover/50"
              >
                <span className="text-text-secondary tabular-nums">
                  {p.receivedAt || p.dueAt
                    ? formatDate(p.receivedAt ?? p.dueAt!)
                    : "—"}
                </span>
                <span className="font-medium tabular-nums text-ink">
                  {formatMoney(Number(p.amount), currency)}
                </span>
                <span className="text-text-secondary">
                  {labelFor(PAYMENT_METHOD_LABELS, p.method)}
                </span>
                <span className="text-text-secondary">
                  {labelFor(PAYMENT_STATUS_LABELS, p.status)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <PaymentPeekModal paymentId={peekId} onClose={() => setPeekId(null)} />
    </div>
  );
}
