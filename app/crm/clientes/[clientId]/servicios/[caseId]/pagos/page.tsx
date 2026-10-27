import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CreditCard } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import * as caseService from "@/src/server/cases";
import { DomainError } from "@/src/server/errors";
import {
  ButtonLink,
  Card,
  CardBody,
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
import { PAYMENT_METHOD_LABELS, labelFor } from "@/src/lib/labels";
import { CaseHeader } from "../case-header";

export const metadata: Metadata = {
  title: "Pagos del caso",
};

export default async function CasePaymentsPage({
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

  const { case: creditCase, payments, caseBalance } = detail;

  return (
    <div>
      <CaseHeader
        creditCase={creditCase}
        actions={
          <ButtonLink
            href={`/crm/pagos?clientId=${creditCase.client.id}`}
            variant="secondary"
            size="sm"
          >
            Ir a Pagos
          </ButtonLink>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-[12px] text-text-secondary">Monto acordado</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {caseBalance.agreedAmount
                ? formatMoney(caseBalance.agreedAmount, caseBalance.currency)
                : "—"}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[12px] text-text-secondary">Recibido</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {formatMoney(caseBalance.paid, caseBalance.currency)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-[12px] text-text-secondary">Balance del expediente</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
              {caseBalance.balance
                ? formatMoney(caseBalance.balance, caseBalance.currency)
                : "Sin monto acordado"}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Pagos del caso"
          description="Vista de solo lectura. El registro y control de pagos está en la sección Pagos."
        />
        {payments.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Sin pagos"
            description="Este caso aún no tiene pagos registrados."
            action={
              <ButtonLink
                href={`/crm/pagos?clientId=${creditCase.client.id}`}
                variant="secondary"
                size="sm"
              >
                Ir a Pagos
              </ButtonLink>
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Monto</TH>
                <TH>Método</TH>
                <TH>Estado</TH>
                <TH>Vence</TH>
                <TH>Recibido</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((payment) => (
                <TR key={payment.id}>
                  <TD className="tabular-nums font-medium text-ink">
                    {formatMoney(payment.amount, payment.currency)}
                  </TD>
                  <TD>{labelFor(PAYMENT_METHOD_LABELS, payment.method)}</TD>
                  <TD>
                    <StatusPill domain="payment" value={payment.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {payment.dueAt ? formatDate(payment.dueAt) : "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {payment.receivedAt ? formatDate(payment.receivedAt) : "—"}
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
