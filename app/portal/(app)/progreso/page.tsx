import type { Metadata } from "next";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/src/components/ui";
import { requirePortalSession } from "@/src/server/auth/guards";
import * as portal from "@/src/server/portal";
import { formatDate } from "@/src/lib/format";
import {
  CASE_STATE_LABELS,
  CREDIT_BUREAU_LABELS,
  labelFor,
  ROUND_STATUS_LABELS,
} from "@/src/lib/labels";
import { LineChart } from "lucide-react";

export const metadata: Metadata = { title: "Progreso" };

export default async function PortalProgresoPage() {
  const ctx = await requirePortalSession();
  const home = await portal.getPortalHome(ctx.clientId, ctx.organizationId);
  const activeCase = home.activeCase;

  return (
    <div>
      <PageHeader
        title="Progreso"
        description="Estado de tu caso, ronda actual y scores del último reporte."
      />
      <Card>
        <CardHeader title="Resumen" />
        <CardBody>
          {!activeCase ? (
            <EmptyState
              icon={LineChart}
              title="Sin progreso visible"
              description="Aún no hay un caso abierto con reportes."
            />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink">
                Caso <span className="font-medium">{activeCase.caseCode}</span>
                {" · "}
                {labelFor(CASE_STATE_LABELS, activeCase.state)}
                {" · "}
                Etapa {activeCase.stageName}
              </p>
              <p className="text-sm text-text-secondary">
                Próxima revisión:{" "}
                {activeCase.nextReviewAt
                  ? formatDate(activeCase.nextReviewAt)
                  : "Sin fecha"}
              </p>
              <p className="text-sm text-text-secondary">
                Ronda:{" "}
                {activeCase.currentRound
                  ? `#${activeCase.currentRound.roundNumber} (${labelFor(ROUND_STATUS_LABELS, activeCase.currentRound.status)})`
                  : "Sin ronda"}
              </p>
              {activeCase.scores.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {activeCase.scores.map((s) => (
                    <div
                      key={s.bureau}
                      className="rounded-surface bg-surface-app px-3 py-3"
                    >
                      <p className="text-xs text-text-secondary">
                        {labelFor(CREDIT_BUREAU_LABELS, s.bureau)}
                      </p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
                        {s.score ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-secondary">
                  Aún no hay scores registrados.
                </p>
              )}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
