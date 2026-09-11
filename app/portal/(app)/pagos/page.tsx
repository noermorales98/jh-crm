import type { Metadata } from "next";
import {
  Card,
  EmptyState,
  PageHeader,
  Pill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { requirePortalSession } from "@/src/server/auth/guards";
import * as portal from "@/src/server/portal";
import { formatDate, formatMoney } from "@/src/lib/format";
import {
  labelFor,
  PAYMENT_METHOD_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/src/lib/labels";
import { CreditCard } from "lucide-react";

export const metadata: Metadata = { title: "Pagos" };

const STATUS_TONE: Record<string, "green" | "amber" | "slate" | "blue" | "red"> =
  {
    PENDING: "amber",
    RECEIVED: "green",
    CANCELLED: "red",
    REFUNDED: "slate",
  };

export default async function PortalPagosPage() {
  const ctx = await requirePortalSession();
  const payments = await portal.listPortalPayments(
    ctx.clientId,
    ctx.organizationId,
  );

  return (
    <div>
      <PageHeader
        title="Pagos"
        description="Historial de pagos y recibos asociados a tu cuenta."
      />
      <Card>
        {payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Sin pagos"
            description="Cuando registremos un pago, lo verás aquí con su recibo si aplica."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Monto</TH>
                <TH>Estado</TH>
                <TH>Método</TH>
                <TH>Fecha</TH>
                <TH>Recibo</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD className="tabular-nums font-medium">
                    {formatMoney(p.amount)}
                  </TD>
                  <TD>
                    <Pill tone={STATUS_TONE[p.status] ?? "slate"}>
                      {labelFor(PAYMENT_STATUS_LABELS, p.status)}
                    </Pill>
                  </TD>
                  <TD>{labelFor(PAYMENT_METHOD_LABELS, p.method)}</TD>
                  <TD className="tabular-nums">
                    {formatDate(p.receivedAt ?? p.createdAt)}
                  </TD>
                  <TD>
                    {p.receipt?.folio ? (
                      <span className="text-sm">{p.receipt.folio}</span>
                    ) : (
                      "—"
                    )}
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
