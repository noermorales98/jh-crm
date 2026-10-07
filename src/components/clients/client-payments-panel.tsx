import Link from "next/link";
import { Wallet } from "lucide-react";
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
import { PAYMENT_METHOD_LABELS, labelFor } from "@/src/lib/labels";

type CaseFilter = { id: string; caseCode: string };

type PaymentRow = {
  id: string;
  amount: number | { toString(): string };
  currency: string;
  method: string;
  status: string;
  dueAt: Date | string | null;
  receivedAt: Date | string | null;
  case: { id: string; caseCode: string } | null;
};

export function ClientPaymentsPanel({
  clientId,
  payments,
  canRegister,
  cases = [],
  scopedCaseId = null,
  filterBasePath,
}: {
  clientId: string;
  payments: PaymentRow[];
  canRegister: boolean;
  cases?: CaseFilter[];
  scopedCaseId?: string | null;
  filterBasePath?: string;
}) {
  const scoped = scopedCaseId
    ? (cases.find((c) => c.id === scopedCaseId) ?? null)
    : null;
  const nuevoHref = scoped
    ? `/crm/pagos/nuevo?clientId=${clientId}&caseId=${scoped.id}`
    : `/crm/pagos/nuevo?clientId=${clientId}`;

  return (
    <div className="space-y-3">
      {filterBasePath && cases.length > 1 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-text-secondary">Filtrar por servicio:</span>
          <Link
            href={filterBasePath}
            className={
              !scoped
                ? "font-medium text-action-primary"
                : "text-text-secondary hover:text-ink"
            }
          >
            Todos
          </Link>
          {cases.map((c) => (
            <Link
              key={c.id}
              href={`${filterBasePath}?caseId=${c.id}`}
              className={
                scoped?.id === c.id
                  ? "font-medium text-action-primary"
                  : "font-mono text-text-secondary hover:text-ink"
              }
            >
              {c.caseCode}
            </Link>
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader
          title="Pagos"
          description={
            scoped
              ? `Solo pagos del expediente ${scoped.caseCode}.`
              : "Historial de pagos asociados a este cliente."
          }
          actions={
            canRegister ? (
              <ButtonLink href={nuevoHref} size="sm">
                Registrar pago
              </ButtonLink>
            ) : undefined
          }
        />
        {payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Sin pagos"
            description="Aún no hay pagos registrados para este alcance."
            action={
              canRegister ? (
                <ButtonLink href={nuevoHref} size="sm">
                  Registrar pago
                </ButtonLink>
              ) : null
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
                <TH>Caso</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id} className="transition-colors hover:bg-nav-hover">
                  <TD>
                    <Link
                      href={`/crm/pagos?id=${p.id}`}
                      className="font-medium tabular-nums text-action-primary hover:text-action-secondary"
                    >
                      {formatMoney(Number(p.amount), p.currency)}
                    </Link>
                  </TD>
                  <TD className="text-xs text-text-secondary-strong">
                    {labelFor(PAYMENT_METHOD_LABELS, p.method)}
                  </TD>
                  <TD>
                    <StatusPill domain="payment" value={p.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {p.dueAt ? formatDate(p.dueAt) : "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-text-secondary">
                    {p.receivedAt ? formatDate(p.receivedAt) : "—"}
                  </TD>
                  <TD>
                    {p.case ? (
                      <Link
                        href={`/crm/casos/${p.case.id}`}
                        className="font-mono text-xs text-action-primary hover:text-action-secondary"
                      >
                        {p.case.caseCode}
                      </Link>
                    ) : (
                      <span className="text-text-secondary">—</span>
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
