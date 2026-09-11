import { notFound } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as receiptService from "@/src/server/receipts";
import { DomainError } from "@/src/server/errors";
import {
  buttonClasses,
  Card,
  CardBody,
  CardHeader,
  Pill,
} from "@/src/components/ui";
import { formatDate, formatMoney } from "@/src/lib/format";
import { labelFor, PAYMENT_METHOD_LABELS } from "@/src/lib/labels";
import { clientFullName } from "@/src/server/page-helpers";
import { VoidReceiptButton } from "@/src/components/receipts/void-receipt-button";

export async function ReceiptDetailPanel({ receiptId }: { receiptId: string }) {
  const ctx = await requireOrganization();
  let receipt: Awaited<ReturnType<typeof receiptService.getReceipt>>;
  try {
    receipt = await receiptService.getReceipt(ctx, receiptId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const canVoid = can(ctx.role, "receipts.void");

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="font-mono text-lg font-semibold text-ink">{receipt.folio}</h2>
        <div className="mt-2">
          {receipt.status === "ISSUED" ? (
            <Pill tone="green">Emitido</Pill>
          ) : (
            <Pill tone="red">Anulado</Pill>
          )}
        </div>
      </div>

      <Card>
        <CardHeader title="Detalle" />
        <CardBody>
          <dl className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Cliente</dt>
              <dd className="text-[13px] text-ink">
                <Link
                  href={`/crm/clientes?id=${receipt.client.id}`}
                  className="text-action-primary hover:text-action-secondary"
                >
                  {clientFullName(receipt.client)}
                </Link>
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Monto</dt>
              <dd className="text-[13px] tabular-nums text-ink">
                {formatMoney(receipt.amount, receipt.currency)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Método</dt>
              <dd className="text-[13px] text-ink">{labelFor(PAYMENT_METHOD_LABELS, receipt.paymentMethod)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-[12px] text-text-secondary">Emitido</dt>
              <dd className="text-[13px] text-ink">{formatDate(receipt.issuedAt)}</dd>
            </div>
            {receipt.payment?.quote ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[12px] text-text-secondary">Cotización</dt>
                <dd className="text-[13px] text-ink">
                  <Link
                    href={`/crm/cotizaciones?id=${receipt.payment.quote.id}`}
                    className="font-mono text-action-primary hover:text-action-secondary"
                  >
                    {receipt.payment.quote.folio}
                  </Link>
                </dd>
              </div>
            ) : null}
            {receipt.voidReason ? (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-[12px] text-text-secondary">Motivo de anulación</dt>
                <dd className="text-[13px] text-ink">{receipt.voidReason}</dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      <div className="flex items-center gap-2">
        <a
          href={`/api/receipts/${receipt.id}/pdf`}
          className={buttonClasses("ghost", "sm")}
        >
          <Download className="size-3.5" aria-hidden />
          PDF
        </a>
        {canVoid && receipt.status === "ISSUED" ? (
          <VoidReceiptButton receiptId={receipt.id} folio={receipt.folio} />
        ) : null}
      </div>
    </div>
  );
}
