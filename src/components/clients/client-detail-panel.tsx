import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getClientOverview } from "@/src/server/clients/overview";
import { listMemberOptions } from "@/src/server/page-helpers";
import { listStages } from "@/src/server/config";
import { listVerticalServiceOptions } from "@/src/server/services/verticals";
import { DomainError } from "@/src/server/errors";
import { ClientActions } from "@/src/components/clients/client-actions";
import { ClientHeader } from "@/app/crm/clientes/[clientId]/client-header";
import { ClientServiceSwitcher } from "@/src/components/clients/client-service-switcher";
import { ClientQuickAdd } from "@/src/components/clients/client-quick-add";
import { ClientOverviewPanel } from "@/src/components/clients/client-overview-panel";
import { CreateIntakeLinkCard } from "@/src/components/intake/create-intake-link-card";
import { isIntakeEnabled } from "@/src/server/intake";
import { listClientIntakeLinks } from "@/src/server/intake/links";
import * as processors from "@/src/server/processors";
import { LinkProcessorButton } from "@/src/components/processors/link-processor-button";
import { InvitePortalButton } from "@/src/components/portal/invite-portal-button";
import { isPortalEnabled, getPortalAccess } from "@/src/server/portal";
import { Pill } from "@/src/components/ui";
import {
  labelFor,
  PROCESSOR_ACCOUNT_STATUS_LABELS,
} from "@/src/lib/labels";

export async function ClientDetailPanel({
  clientId,
  caseId,
}: {
  clientId: string;
  caseId?: string | null;
}) {
  const ctx = await requireOrganization();

  let overview: Awaited<ReturnType<typeof getClientOverview>>;
  try {
    overview = await getClientOverview(ctx, clientId, { caseId });
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client } = overview;
  const canEdit = can(ctx.role, "clients.edit");
  const members = canEdit || can(ctx.role, "tasks.manage")
    ? await listMemberOptions(ctx)
    : [];
  const canManageCases = can(ctx.role, "cases.manage");
  const [stages, verticalServices] = canManageCases
    ? await Promise.all([
        listStages(ctx, false),
        listVerticalServiceOptions(ctx.organizationId),
      ])
    : [[], []];

  const intakeEnabled = isIntakeEnabled();
  const intakeLinks = intakeEnabled
    ? await listClientIntakeLinks(ctx, client.id)
    : [];
  const canViewProcessors = can(ctx.role, "processors.view");
  const canManageProcessors = can(ctx.role, "processors.manage");
  const processorAccounts = canViewProcessors
    ? await processors.listAccountsForClient(ctx, client.id)
    : [];
  const activeProcessors = canManageProcessors
    ? await processors.listProcessors(ctx, false)
    : [];
  const canManagePortal = can(ctx.role, "portal.manage");
  const portalEnabled = isPortalEnabled();
  const portalAccess =
    canManagePortal && portalEnabled
      ? await getPortalAccess(ctx, client.id)
      : null;

  const activeCaseId =
    overview.activeService?.creditCaseId ??
    overview.activeService?.serviceCaseId ??
    null;

  return (
    <div>
      <ClientHeader
        client={{
          id: client.id,
          clientCode: client.clientCode,
          firstName: client.firstName,
          lastName: client.lastName,
          status: client.status,
          email: client.email,
          phone: client.phone,
          source: client.source,
          leadChannel: client.leadChannel,
          assignedTo: client.assignedTo,
        }}
        meta={
          <ClientServiceSwitcher
            clientId={client.id}
            services={overview.services}
            activeCaseId={activeCaseId}
          />
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ClientQuickAdd
              clientId={client.id}
              caseId={overview.activeService?.creditCaseId ?? null}
              serviceCaseId={overview.activeService?.serviceCaseId ?? null}
              members={members}
              canTask={can(ctx.role, "tasks.manage")}
              canDocument={can(ctx.role, "documents.upload")}
              canPayment={can(ctx.role, "payments.register")}
              canReport={
                can(ctx.role, "creditReports.manage") &&
                overview.activeService?.kind === "CREDIT_REPAIR"
              }
              canRound={
                can(ctx.role, "rounds.manage") &&
                overview.activeService?.kind === "CREDIT_REPAIR"
              }
              canNote={
                can(ctx.role, "clients.edit") || can(ctx.role, "cases.manage")
              }
              canServiceNote={can(ctx.role, "cases.manage")}
              canQuote={can(ctx.role, "quotes.manage")}
            />
            {canEdit ? (
              <ClientActions
                clientId={client.id}
                currentAssigneeId={client.assignedToId}
                isArchived={client.status === "ARCHIVED"}
                members={members}
              />
            ) : null}
          </div>
        }
      />

      <ClientOverviewPanel
        overview={overview}
        canManageCredit={can(ctx.role, "creditReports.manage")}
        canManageCases={canManageCases}
        canRegisterPayment={can(ctx.role, "payments.register")}
        stages={stages.map((s) => ({ id: s.id, name: s.name, color: s.color }))}
        services={verticalServices}
        members={members}
      />

      {/* Secundario: fila compacta L→R */}
      {(intakeEnabled ||
        (portalEnabled && canManagePortal) ||
        canViewProcessors) && (
        <details className="mt-4 overflow-hidden rounded-surface border border-border-subtle/50 bg-surface-panel">
          <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-text-secondary marker:content-none [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1.5">
              Accesos e integraciones
              <span className="font-normal normal-case tracking-normal text-text-placeholder">
                · intake · portal · procesadores
              </span>
            </span>
          </summary>
          <div className="grid gap-px border-t border-border-subtle bg-border-subtle sm:grid-cols-2 lg:grid-cols-3">
            {intakeEnabled ? (
              <div className="bg-surface-panel p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    Formulario
                  </h3>
                  {intakeLinks.length > 0 ? (
                    <span className="tabular-nums text-[11px] text-text-secondary">
                      {intakeLinks.filter((l) => l.usable).length}/{intakeLinks.length} activos
                    </span>
                  ) : null}
                </div>
                <CreateIntakeLinkCard
                  clientId={client.id}
                  cases={overview.services
                    .filter((s) => s.creditCaseId != null)
                    .map((s) => ({
                      id: s.creditCaseId!,
                      caseCode: s.caseCode,
                    }))}
                  existingLinks={intakeLinks}
                  compact
                />
              </div>
            ) : null}

            {portalEnabled && canManagePortal ? (
              <div className="bg-surface-panel p-3">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                  Portal
                </h3>
                <InvitePortalButton
                  clientId={client.id}
                  defaultEmail={client.email}
                  access={portalAccess}
                  compact
                />
              </div>
            ) : null}

            {canViewProcessors ? (
              <div className="bg-surface-panel p-3 sm:col-span-2 lg:col-span-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
                    Procesadores
                  </h3>
                  {canManageProcessors ? (
                    <LinkProcessorButton
                      clientId={client.id}
                      processors={activeProcessors.map((p) => ({
                        id: p.id,
                        name: p.name,
                      }))}
                    />
                  ) : null}
                </div>
                {processorAccounts.length === 0 ? (
                  <p className="text-xs text-text-secondary">Sin cuentas vinculadas.</p>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {processorAccounts.map((acc) => (
                      <li key={acc.id}>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-surface-app px-2 py-0.5 text-xs">
                          <span className="font-medium text-ink">
                            {acc.processor.name}
                          </span>
                          <Pill tone="slate">
                            {labelFor(
                              PROCESSOR_ACCOUNT_STATUS_LABELS,
                              acc.status,
                            )}
                          </Pill>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </details>
      )}
    </div>
  );
}
