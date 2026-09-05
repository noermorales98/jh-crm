import type { Metadata } from "next";
import { Scale } from "lucide-react";
import { requirePermission } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { prisma } from "@/src/lib/db";
import * as contracts from "@/src/server/contracts";
import {
  Card,
  CardBody,
  CardHeader,
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
import { formatDate } from "@/src/lib/format";
import { CONTRACT_STATUS_LABELS, labelFor } from "@/src/lib/labels";
import {
  CreateContractButton,
  UpsertTemplateButton,
} from "@/src/components/contracts/contract-actions";
import { ContractRowActions } from "@/src/components/contracts/contract-row-actions";

export const metadata: Metadata = {
  title: "Contratos",
};

const STATUS_TONE: Record<string, "green" | "amber" | "slate" | "blue" | "red"> =
  {
    DRAFT: "slate",
    SENT: "blue",
    SIGNED: "green",
    CANCELLED: "red",
    EXPIRED: "amber",
  };

export default async function ContratosPage() {
  const ctx = await requirePermission("contracts.view");
  const canManage = can(ctx.role, "contracts.manage");
  const [{ items }, templates] = await Promise.all([
    contracts.listContracts(ctx, { limit: 50 }),
    contracts.listTemplates(ctx, true),
  ]);

  const clients = canManage
    ? await prisma.client.findMany({
        where: {
          organizationId: ctx.organizationId,
          archivedAt: null,
          status: { in: ["LEAD", "ACTIVE", "PAUSED"] },
        },
        select: {
          id: true,
          clientCode: true,
          firstName: true,
          lastName: true,
        },
        orderBy: [{ updatedAt: "desc" }],
        take: 200,
      })
    : [];

  const clientOptions = clients.map((c) => ({
    id: c.id,
    label: `${c.clientCode} · ${[c.firstName, c.lastName].filter(Boolean).join(" ")}`,
  }));

  const activeTemplates = templates.filter((t) => t.active);

  return (
    <div>
      <PageHeader
        title="Contratos"
        description="Plantillas y contratos de servicio con firma digital."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <UpsertTemplateButton />
              <CreateContractButton
                clients={clientOptions}
                templates={activeTemplates.map((t) => ({
                  id: t.id,
                  name: t.name,
                  version: t.version,
                }))}
              />
            </div>
          ) : null
        }
      />

      {canManage ? (
        <Card className="mb-4">
          <CardHeader
            title="Plantillas"
            description="Contenido HTML base para emitir contratos."
          />
          <CardBody>
            {templates.length === 0 ? (
              <EmptyState
                icon={Scale}
                title="Sin plantillas"
                description="Crea una plantilla para poder emitir contratos."
                action={<UpsertTemplateButton />}
              />
            ) : (
              <ul className="divide-y divide-border-subtle">
                {templates.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {t.name}{" "}
                        <span className="text-text-secondary">v{t.version}</span>
                      </p>
                      <p className="text-xs text-text-secondary">
                        {t.active ? "Activa" : "Inactiva"}
                      </p>
                    </div>
                    <UpsertTemplateButton
                      initial={{
                        id: t.id,
                        name: t.name,
                        version: t.version,
                        contentHtml: t.contentHtml,
                        active: t.active,
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        {items.length === 0 ? (
          <EmptyState
            icon={Scale}
            title="Sin contratos"
            description="Emite un contrato desde una plantilla activa."
            action={
              canManage ? (
                <CreateContractButton
                  clients={clientOptions}
                  templates={activeTemplates.map((t) => ({
                    id: t.id,
                    name: t.name,
                    version: t.version,
                  }))}
                />
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH>Título</TH>
                <TH>Estado</TH>
                <TH>Creado</TH>
                <TH>Firmado</TH>
                {canManage ? <TH>Acciones</TH> : null}
              </TR>
            </THead>
            <TBody>
              {items.map((contract) => (
                <TR key={contract.id}>
                  <TD>
                    {contract.client.clientCode} ·{" "}
                    {[contract.client.firstName, contract.client.lastName]
                      .filter(Boolean)
                      .join(" ")}
                  </TD>
                  <TD>
                    <span className="font-medium text-ink">{contract.title}</span>
                    <span className="ml-1 text-xs text-text-secondary">
                      v{contract.version}
                    </span>
                  </TD>
                  <TD>
                    <Pill tone={STATUS_TONE[contract.status] ?? "slate"}>
                      {labelFor(CONTRACT_STATUS_LABELS, contract.status)}
                    </Pill>
                  </TD>
                  <TD>{formatDate(contract.createdAt)}</TD>
                  <TD>
                    {contract.signedAt ? formatDate(contract.signedAt) : "—"}
                  </TD>
                  {canManage ? (
                    <TD>
                      <ContractRowActions
                        contractId={contract.id}
                        status={contract.status}
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
