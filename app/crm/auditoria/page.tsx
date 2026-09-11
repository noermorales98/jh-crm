import type { Metadata } from "next";
import { ScrollText, ShieldAlert } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { listAuditLogs, KNOWN_AUDIT_ACTIONS } from "@/src/server/audit/queries";
import {
  firstParam,
  listMemberOptions,
  parseDateParam,
  parseEnumParam,
  type SearchParams,
} from "@/src/server/page-helpers";
import {
  Card,
  CursorPagination,
  EmptyState,
  FilterBar,
  FilterDate,
  FilterSelect,
  ListToolbar,
  PageHeader,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDateTime } from "@/src/lib/format";

export const metadata: Metadata = {
  title: "Auditoría",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  SENSITIVE_PROFILE_VIEWED: "Perfil sensible visto",
  SENSITIVE_PROFILE_UPDATED: "Perfil sensible editado",
  DOCUMENT_DOWNLOADED: "Documento descargado",
  DOCUMENT_DELETED: "Documento eliminado",
  PAYMENT_RECEIVED: "Pago recibido",
  PAYMENT_CANCELLED: "Pago cancelado",
  PAYMENT_REFUNDED: "Pago reembolsado",
  RECEIPT_VOIDED: "Recibo anulado",
  MEMBER_INVITED: "Miembro invitado",
  MEMBER_ROLE_CHANGED: "Rol de miembro cambiado",
  MEMBER_DEACTIVATED: "Miembro desactivado",
  INTAKE_SUBMITTED: "Formulario enviado",
  CONTRACT_CREATED: "Contrato creado",
};

const ENTITY_TYPES = [
  "Client",
  "ClientSensitiveProfile",
  "CreditCase",
  "Document",
  "Payment",
  "Receipt",
  "OrganizationMember",
  "User",
  "IntakeSubmission",
];

export default async function AuditPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const ctx = await requireOrganization();

  if (!can(ctx.role, "audit.view")) {
    return (
      <div>
        <PageHeader
          title="Auditoría"
          description="Registro de eventos sensibles y de seguridad."
        />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Acceso restringido"
            description="Solo el propietario y los administradores pueden consultar la auditoría."
          />
        </Card>
      </div>
    );
  }

  const sp = await searchParams;
  const action = parseEnumParam(
    firstParam(sp, "action"),
    KNOWN_AUDIT_ACTIONS as unknown as string[],
  );
  const entityType = parseEnumParam(firstParam(sp, "entityType"), ENTITY_TYPES);
  const actorUserId = firstParam(sp, "actor");
  const from = parseDateParam(firstParam(sp, "from"));
  const to = parseDateParam(firstParam(sp, "to"));
  const cursor = firstParam(sp, "cursor");

  const [result, members] = await Promise.all([
    listAuditLogs(ctx, { action, entityType, actorUserId, from, to, cursor }),
    listMemberOptions(ctx),
  ]);

  return (
    <div>
      <PageHeader
        title="Auditoría"
        description="Eventos de seguridad: accesos a datos sensibles, documentos, pagos, recibos y membresías."
      />

      <ListToolbar
        filters={
          <FilterBar>
            <FilterSelect
              name="action"
              label="Acción"
              options={KNOWN_AUDIT_ACTIONS.map((a) => ({
                value: a,
                label: AUDIT_ACTION_LABELS[a] ?? a,
              }))}
            />
            <FilterSelect
              name="entityType"
              label="Entidad"
              options={ENTITY_TYPES.map((t) => ({ value: t, label: t }))}
            />
            <FilterSelect
              name="actor"
              label="Actor"
              options={members.map((m) => ({ value: m.id, label: m.name }))}
            />
            <FilterDate name="from" label="Desde" />
            <FilterDate name="to" label="Hasta" />
          </FilterBar>
        }
      />

      <Card>
        {result.items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Sin eventos"
            description={
              action || entityType || actorUserId || from || to
                ? "Ningún evento coincide con los filtros aplicados."
                : "Aún no hay eventos de auditoría registrados."
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Fecha y hora</TH>
                <TH>Actor</TH>
                <TH>Acción</TH>
                <TH>Entidad</TH>
                <TH>Detalle</TH>
              </TR>
            </THead>
            <TBody>
              {result.items.map((log) => (
                <TR key={log.id} className="align-top transition-colors hover:bg-nav-hover">
                  <TD className="whitespace-nowrap tabular-nums text-text-secondary">
                    {formatDateTime(log.createdAt)}
                  </TD>
                  <TD>
                    {log.actor ? (
                      <>
                        <span className="block text-ink">
                          {log.actor.name ?? log.actor.email}
                        </span>
                        <span className="block font-mono text-[12px] text-text-secondary">
                          {log.actor.email}
                        </span>
                      </>
                    ) : (
                      <span className="text-text-secondary">Sistema</span>
                    )}
                  </TD>
                  <TD className="font-medium text-ink">
                    {AUDIT_ACTION_LABELS[log.action] ?? log.action}
                  </TD>
                  <TD>
                    <span className="block font-mono text-[12px] text-text-secondary-strong">{log.entityType}</span>
                    {log.entityId ? (
                      <span
                        className="block font-mono text-[12px] text-text-secondary"
                        title={log.entityId}
                      >
                        {log.entityId.slice(0, 8)}…
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    {log.metadata ? (
                      <details className="text-[12px]">
                        <summary className="cursor-pointer text-action-primary hover:text-action-secondary">
                          Ver metadata
                        </summary>
                        <pre className="mt-1 max-w-md overflow-x-auto rounded-control bg-surface-app p-2 font-mono text-[12px] text-text-secondary-strong">
                          {JSON.stringify(log.metadata, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}

        <CursorPagination
          pathname="/crm/auditoria"
          params={{
            action,
            entityType,
            actor: actorUserId,
            from: firstParam(sp, "from"),
            to: firstParam(sp, "to"),
            back: firstParam(sp, "back"),
          }}
          cursor={cursor}
          nextCursor={result.nextCursor}
        />
      </Card>
    </div>
  );
}
