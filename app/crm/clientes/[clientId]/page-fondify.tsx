import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { getClientOverview } from "@/src/server/clients/overview";
import { clientFullName } from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import {
  ClientDetailHeader,
  ActionCenter,
  KpiCard,
} from "@/src/components/fondify";
import { formatDate } from "@/src/lib/format/dates";

export const metadata: Metadata = {
  title: "Cliente",
};

export default async function ClientDetailPageFondify({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const ctx = await requireOrganization();
  const { clientId } = await params;

  let overview: Awaited<ReturnType<typeof getClientOverview>>;
  try {
    overview = await getClientOverview(ctx, clientId, { caseId: null });
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client } = overview;
  const fullName = clientFullName(client);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <ClientDetailHeader
        clientName={fullName}
        clientEmail={client.email ?? "Sin correo"}
        status={client.status}
        reportsCount={0}
        roundNumber={1}
        reviewDate="27d"
      />

      <div className="rounded-[var(--ff-radius-lg)] bg-[var(--ff-warning-bg)] border-2 border-[var(--ff-warning-border)] p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="size-5 shrink-0 text-[var(--ff-warning-fg)]" strokeWidth={2} />
          <div>
            <p className="font-semibold text-[var(--ff-warning-fg)]">
              Gran oportunidad de reparación
            </p>
            <p className="mt-1 text-[var(--ff-fs-sm)] text-[var(--ff-text-secondary)]">
              Tiene 5 cuentas negativas frenándolo. Al limpiarlas queda listo para fondeo.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          kicker="POR ARREGLAR"
          value="5"
          subtitle="cuentas negativas"
          variant="danger"
        />
        <KpiCard
          kicker="FONDEO POTENCIAL"
          value="—"
          subtitle="lo que puede conseguir"
        />
        <KpiCard
          kicker="ASESORÍA HOY"
          value="$483"
          subtitle="de un total de $1,610"
          variant="primary"
        />
      </div>

      <ActionCenter clientId={clientId} />
    </div>
  );
}
