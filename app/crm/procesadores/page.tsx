import type { Metadata } from "next";
import { Cpu } from "lucide-react";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as processors from "@/src/server/processors";
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
import { formatMoney } from "@/src/lib/format";
import { ProcessorFormButton } from "@/src/components/processors/processor-form-button";

export const metadata: Metadata = {
  title: "Procesadores",
};

export default async function ProcessorsPage() {
  const ctx = await requirePermission("processors.view");
  const canManage = can(ctx.role, "processors.manage");
  const rows = await processors.listProcessors(ctx, true);

  return (
    <div>
      <PageHeader
        title="Procesadores de crédito"
        description="Catálogo de servicios externos (monitoreo, afiliados). Sin contraseñas."
        actions={canManage ? <ProcessorFormButton mode="create" /> : null}
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={Cpu}
            title="Sin procesadores"
            description="Agrega SmartCredit u otros proveedores para vincularlos a clientes."
            action={canManage ? <ProcessorFormButton mode="create" /> : null}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Tipo</TH>
                <TH className="text-right">Precio / mes</TH>
                <TH className="text-right">Comisión</TH>
                <TH>Estado</TH>
                {canManage ? <TH className="text-right">Acciones</TH> : null}
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id} className="transition-colors hover:bg-nav-hover">
                  <TD className="font-medium text-ink">{row.name}</TD>
                  <TD className="text-text-secondary">{row.type}</TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">
                    {row.monthlyPrice
                      ? formatMoney(row.monthlyPrice)
                      : "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-right tabular-nums">
                    {row.commission ? formatMoney(row.commission) : "—"}
                  </TD>
                  <TD>
                    {row.active ? (
                      <Pill tone="green">Activo</Pill>
                    ) : (
                      <Pill tone="slate">Inactivo</Pill>
                    )}
                  </TD>
                  {canManage ? (
                    <TD className="whitespace-nowrap text-right">
                      <ProcessorFormButton
                        mode="edit"
                        processorId={row.id}
                        initialValues={{
                          name: row.name,
                          type: row.type,
                          websiteUrl: row.websiteUrl ?? "",
                          affiliateUrl: row.affiliateUrl ?? "",
                          monthlyPrice: row.monthlyPrice?.toString() ?? "",
                          commission: row.commission?.toString() ?? "",
                          instructions: row.instructions ?? "",
                          active: row.active,
                        }}
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
