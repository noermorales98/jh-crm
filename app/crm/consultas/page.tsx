import type { Metadata } from "next";
import Link from "next/link";
import { Headphones } from "lucide-react";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as consultations from "@/src/server/consultations";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusPill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate, formatMoney } from "@/src/lib/format";
import { ConsultationStatusActions } from "@/src/components/consultations/consultation-status-actions";

export const metadata: Metadata = {
  title: "Consultas",
};

export default async function ConsultationsPage() {
  const ctx = await requirePermission("consultations.view");
  const canManage = can(ctx.role, "consultations.manage");
  const paymentConfigured = await consultations.isConsultationPaymentConfigured(
    ctx.organizationId,
  );
  const { items } = await consultations.listConsultations(ctx, { limit: 50 });

  return (
    <div>
      <PageHeader
        title="Consultas"
        description={
          paymentConfigured
            ? "Solicitudes de consulta. El cobro online está habilitado."
            : "Solicitudes de consulta ($1). Sin pasarela configurada: permanecen en «Solicitada» (nunca se finge el pago)."
        }
      />

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={Headphones}
            title="Sin consultas"
            description="Las solicitudes del formulario de contacto aparecerán aquí."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Monto</TH>
                <TH>Solicitada</TH>
                <TH>Estado</TH>
                {canManage ? <TH>Acciones</TH> : null}
              </TR>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id} className="transition-colors hover:bg-nav-hover">
                  <TD>
                    <Link
                      href={`/crm/clientes/${row.client.id}`}
                      className="font-medium text-action-primary hover:underline"
                    >
                      {row.client.clientCode} ·{" "}
                      {[row.client.firstName, row.client.lastName]
                        .filter(Boolean)
                        .join(" ")}
                    </Link>
                  </TD>
                  <TD className="tabular-nums">{formatMoney(row.amount)}</TD>
                  <TD>{formatDate(row.requestedAt)}</TD>
                  <TD>
                    <StatusPill domain="consultation" value={row.status} />
                  </TD>
                  {canManage ? (
                    <TD>
                      <ConsultationStatusActions
                        consultationId={row.id}
                        status={row.status}
                        paymentConfigured={paymentConfigured}
                        clientPhone={row.client.phone}
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
