import type { Metadata } from "next";
import { Alert, Card, CardBody, CardHeader, PageHeader, Tabs } from "@/src/components/ui";
import {
  ConnectionList,
  ConnectorSwitch,
  CopyConnectorUrl,
  type ConnectionView,
} from "@/src/components/config/claude-connector-panel";
import { formatDateTime } from "@/src/lib/format";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import {
  getMcpSettings,
  listMyConnections,
  listOrgConnections,
  type ConnectionRow,
} from "@/src/server/mcp/connections";
import { getOrganizationTimezone } from "@/src/server/org-timezone";
import { CONFIG_TABS } from "../config-tabs";

export const metadata: Metadata = {
  title: "Claude",
};

export const dynamic = "force-dynamic";

function toView(row: ConnectionRow, tz: string): ConnectionView {
  return {
    id: row.id,
    clientName: row.clientName,
    userLabel: row.userName ? `${row.userName} · ${row.userEmail}` : row.userEmail,
    createdAt: formatDateTime(row.createdAt, tz),
    lastUsedAt: row.lastUsedAt ? formatDateTime(row.lastUsedAt, tz) : null,
    status: row.status,
  };
}

export default async function ClaudeSettingsPage() {
  const ctx = await requireOrganization();
  const isAdmin = can(ctx.role, "settings.manage");
  const [settings, tz] = await Promise.all([getMcpSettings(ctx), getOrganizationTimezone(ctx.organizationId)]);
  const [mine, org] = await Promise.all([
    listMyConnections(ctx),
    isAdmin ? listOrgConnections(ctx) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Claude"
        description="Conecta Claude (web, escritorio o móvil) con el CRM para consultar y actualizar datos con tu usuario."
      />
      <Tabs items={CONFIG_TABS} />

      {!settings.featureOn ? (
        <Alert tone="info">El conector de Claude no está disponible en esta instalación.</Alert>
      ) : (
        <>
          {!settings.enabled ? (
            <Alert tone="info">
              {isAdmin
                ? "El conector está apagado. Enciéndelo abajo para que el equipo pueda conectar Claude."
                : "El conector está apagado. Pide a un administrador que lo encienda en esta página."}
            </Alert>
          ) : null}

          <Card>
            <CardHeader title="Conectar en 2 pasos" description="Lo hace cada persona una sola vez." />
            <CardBody>
              <ol className="mb-5 list-decimal space-y-2 pl-5 text-sm text-text-secondary">
                <li>
                  En Claude, ve a <span className="font-medium text-ink">Conectores</span> (en Ajustes o Personalizar),
                  elige <span className="font-medium text-ink">añadir un conector personalizado</span> y pega esta
                  dirección. Si usas Claude con un plan de equipo, pide a quien lo administra que lo añada una vez.
                </li>
                <li>
                  Pulsa <span className="font-medium text-ink">Conectar</span>, entra con tu usuario del CRM y pulsa{" "}
                  <span className="font-medium text-ink">Permitir</span>.
                </li>
              </ol>
              {settings.connectorUrl ? <CopyConnectorUrl url={settings.connectorUrl} /> : null}
              <p className="mt-4 text-xs text-text-secondary">
                Claude nunca podrá hacer más de lo que permite tu rol, y solo en las secciones que ofrece el conector
                (hoy: clientes, casos, tareas, notas, oportunidades y cotizaciones). Nunca verá SSN/ITIN ni números de
                cuenta completos, y cada cambio que haga queda en la auditoría.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Mis conexiones" />
            <CardBody>
              <ConnectionList
                items={mine.map((r) => toView(r, tz))}
                showUser={false}
                emptyText="Todavía no has conectado Claude."
                connectorEnabled={settings.enabled}
              />
            </CardBody>
          </Card>

          {isAdmin ? (
            <>
              <Card>
                <CardHeader title="Conector de la organización" />
                <CardBody>
                  <ConnectorSwitch enabled={settings.enabled} />
                </CardBody>
              </Card>
              <Card>
                <CardHeader
                  title="Conexiones del equipo"
                  description="Las de las demás personas. Puedes cortar el acceso de cualquiera."
                />
                <CardBody>
                  <ConnectionList
                    items={org.filter((r) => r.userId !== ctx.userId).map((r) => toView(r, tz))}
                    showUser
                    emptyText="Nadie más del equipo ha conectado Claude todavía."
                    connectorEnabled={settings.enabled}
                  />
                </CardBody>
              </Card>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
