import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as paymentService from "@/src/server/payments";
import {
  firstParam,
  type SearchParams,
} from "@/src/server/page-helpers";
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
import {
  PAYMENT_METHOD_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { ClientHeader } from "../client-header";

export const metadata: Metadata = {
  title: "Pagos del cliente",
};

export default async function ClientPaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: SearchParams;
}) {
  const { clientId } = await params;
  const sp = await searchParams;
  const caseId = firstParam(sp, "caseId");
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client, cases } = detail;
  const canRegister = can(ctx.role, "payments.register");
  const scopedCase =
    caseId && cases.some((c) => c.id === caseId)
      ? cases.find((c) => c.id === caseId)!
      : null;

  const payments = await paymentService.listPayments(ctx, {
    clientId: client.id,
    caseId: scopedCase?.id,
    limit: 50,
  });

  const nuevoHref = scopedCase
    ? `/crm/pagos/nuevo?clientId=${client.id}&caseId=${scopedCase.id}`
    : `/crm/pagos/nuevo?clientId=${client.id}`;

  return (
    <div>
      <ClientHeader
        client={client}
        actions={
          canRegister ? (
            <ButtonLink href={nuevoHref} size="sm">
              Registrar pago
            </ButtonLink>
          ) : null
        }
        meta={
          cases.length > 1 ? (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-text-secondary">Filtrar por servicio:</span>
              <Link
                href={`/crm/clientes/${client.id}/pagos`}
                className={
                  !scopedCase
                    ? "font-medium text-action-primary"
                    : "text-text-secondary hover:text-ink"
                }
              >
                Todos
              </Link>
              {cases.map((c) => (
                <Link
                  key={c.id}
                  href={`/crm/clientes/${client.id}/pagos?caseId=${c.id}`}
                  className={
                    scopedCase?.id === c.id
                      ? "font-medium text-action-primary"
                      : "font-mono text-text-secondary hover:text-ink"
                  }
                >
                  {c.caseCode}
                </Link>
              ))}
            </div>
          ) : null
        }
      />

      <Card>
        <CardHeader
          title="Pagos"
          description={
            scopedCase
              ? `Solo pagos del expediente ${scopedCase.caseCode}.`
              : "Historial de pagos asociados a este cliente."
          }
        />
        {payments.items.length === 0 ? (
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
              {payments.items.map((p) => (
                <TR key={p.id} className="transition-colors hover:bg-nav-hover">
                  <TD>
                    <Link
                      href={`/crm/pagos?id=${p.id}`}
                      className="font-medium tabular-nums text-action-primary hover:text-action-secondary"
                    >
                      {formatMoney(p.amount, p.currency)}
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
