"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Alert, Modal } from "@/src/components/ui";
import { peekPaymentAction } from "@/src/actions/client-overview";
import { formatDate, formatMoney } from "@/src/lib/format";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
  labelFor,
} from "@/src/lib/labels";

type PeekData = Extract<
  Awaited<ReturnType<typeof peekPaymentAction>>,
  { ok: true }
>["data"];

export function PaymentPeekModal({
  paymentId,
  onClose,
}: {
  paymentId: string | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<PeekData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!paymentId) {
      setData(null);
      setError(null);
      return;
    }
    setData(null);
    setError(null);
    startTransition(async () => {
      const result = await peekPaymentAction(paymentId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setData(result.data);
    });
  }, [paymentId]);

  return (
    <Modal
      open={!!paymentId}
      onClose={onClose}
      title="Detalle de pago"
      description={
        data ? labelFor(PAYMENT_STATUS_LABELS, data.status) : undefined
      }
    >
      {pending && !data ? (
        <p className="text-sm text-text-secondary">Cargando…</p>
      ) : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {data ? (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <dt className="text-text-secondary">Monto</dt>
              <dd className="font-medium tabular-nums">
                {formatMoney(Number(data.amount), data.currency)}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Método</dt>
              <dd>{labelFor(PAYMENT_METHOD_LABELS, data.method)}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Fecha</dt>
              <dd className="tabular-nums">
                {data.receivedAt || data.dueAt
                  ? formatDate(data.receivedAt ?? data.dueAt!)
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-text-secondary">Referencia</dt>
              <dd>{data.reference ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Caso</dt>
              <dd>{data.caseCode ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-text-secondary">Cotización</dt>
              <dd>{data.quoteFolio ?? "—"}</dd>
            </div>
          </dl>
          {data.notes ? (
            <p className="text-xs text-text-secondary whitespace-pre-wrap">
              {data.notes}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3 text-xs">
            {data.receiptId ? (
              <span className="text-text-secondary">
                Recibo: {data.receiptId.slice(0, 8)}…
              </span>
            ) : null}
            <Link
              href={`/crm/pagos?clientId=${data.clientId}`}
              className="font-medium text-action-primary hover:text-action-secondary"
              onClick={onClose}
            >
              Ver pagos del cliente
            </Link>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
