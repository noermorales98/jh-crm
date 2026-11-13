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
                  En Claude, abre{" "}
                  <span className="font-medium text-ink">Ajustes → Conectores → Añadir conector personalizado</span> y
                  pega esta dirección:
                </li>
                <li>
                  Pulsa <span className="font-medium text-ink">Conectar</span>, entra con tu usuario del CRM y pulsa{" "}
                  <span className="font-medium text-ink">Permitir</span>.
                </li>
              </ol>
              {settings.connectorUrl ? <CopyConnectorUrl url={settings.connectorUrl} /> : null}
              <p className="mt-4 text-xs text-text-secondary">
                Claude podrá hacer lo mismo que tu rol en el CRM. Nunca verá SSN/ITIN ni números de cuenta completos, y
                todo lo que haga queda en la auditoría.
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
                <CardHeader title="Conexiones del equipo" description="Puedes cortar el acceso de cualquier persona." />
                <CardBody>
                  <ConnectionList
                    items={org.map((r) => toView(r, tz))}
                    showUser
                    emptyText="Nadie del equipo ha conectado Claude todavía."
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
