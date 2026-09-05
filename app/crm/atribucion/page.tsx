import type { Metadata } from "next";
import { requirePermission } from "@/src/server/auth/guards";
import { getAttributionDashboard } from "@/src/server/attribution";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { Megaphone } from "lucide-react";

export const metadata: Metadata = {
  title: "Atribución",
};

export default async function AttributionPage() {
  const ctx = await requirePermission("attribution.view");
  const { byChannel, byCampaign, conversion } =
    await getAttributionDashboard(ctx);

  return (
    <div>
      <PageHeader
        title="Atribución de leads"
        description="Canales, campañas UTM y conversión prospecto → activo."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Leads por canal" />
          <CardBody className="p-0">
            {byChannel.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="Sin datos"
                description="Los prospectos del sitio web aparecerán aquí con su canal."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Canal</TH>
                    <TH>Cantidad</TH>
                  </TR>
                </THead>
                <TBody>
                  {byChannel.map((row) => (
                    <TR key={row.channel}>
                      <TD className="font-medium text-ink">{row.label}</TD>
                      <TD className="tabular-nums">{row.count}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Por campaña (utm_campaign)" />
          <CardBody className="p-0">
            {byCampaign.length === 0 ? (
              <EmptyState
                icon={Megaphone}
                title="Sin campañas"
                description="Cuando haya UTM en el formulario de contacto, se listarán aquí."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Campaña</TH>
                    <TH>Leads</TH>
                  </TR>
                </THead>
                <TBody>
                  {byCampaign.map((row) => (
                    <TR key={row.campaign}>
                      <TD className="font-medium text-ink">{row.campaign}</TD>
                      <TD className="tabular-nums">{row.count}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Conversión LEAD → ACTIVE"
          description="Conteo de prospectos frente a clientes activos por canal."
        />
        <CardBody className="p-0">
          {conversion.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="Sin conversión aún"
              description="Aparecerá cuando haya prospectos y clientes activos con canal."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Canal</TH>
                  <TH>Prospectos</TH>
                  <TH>Activos</TH>
                  <TH>Ratio</TH>
                </TR>
              </THead>
              <TBody>
                {conversion.map((row) => {
                  const total = row.leads + row.active;
                  const ratio =
                    total > 0
                      ? `${Math.round((row.active / total) * 100)}%`
                      : "—";
                  return (
                    <TR key={row.channel}>
                      <TD className="font-medium text-ink">{row.label}</TD>
                      <TD className="tabular-nums">{row.leads}</TD>
                      <TD className="tabular-nums">{row.active}</TD>
                      <TD className="tabular-nums">{ratio}</TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
