"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContractAction,
  markContractSentAction,
} from "@/src/actions/contracts";
import { Button } from "@/src/components/ui";
import { playActionResult } from "@/src/lib/cuelume";

export function ClientContractHubPanel({
  clientId,
  contractId,
  contractStatus,
  statusLabel,
  templates,
  canManage,
}: {
  clientId: string;
  contractId: string | null;
  contractStatus: string | null;
  statusLabel: string;
  templates: { id: string; name: string; version: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function createDraft() {
    if (!templateId) return;
    setError(null);
    startTransition(async () => {
      const result = await createContractAction({
        clientId,
        templateId,
        cancellationDeadlineDays: 5,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-center text-[13px] text-text-secondary">
        Estado: <strong className="text-ink">{statusLabel}</strong>
      </p>

      {contractId ? (
        <div className="space-y-3 text-center">
          <p className="text-[13px] text-text-secondary">
            Contrato vinculado a este cliente. Envía a firma o revisa detalle en
            Contratos.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {canManage && contractStatus === "DRAFT" ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={pending}
                onClick={() => {
                  startTransition(async () => {
                    const result = await markContractSentAction(contractId);
                    playActionResult(result.ok);
                    if (result.ok) router.refresh();
                    else setError(result.error);
                  });
                }}
              >
                Enviar para firma
              </Button>
            ) : null}
            <Link
              href={`/crm/contratos?clientId=${clientId}`}
              className="inline-flex rounded-control bg-surface-panel px-4 py-2 text-sm font-medium text-ink ring-1 ring-border-subtle"
            >
              Abrir en Contratos
            </Link>
          </div>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
        </div>
      ) : canManage && templates.length > 0 ? (
        <div className="space-y-3">
          <p className="text-[13px] text-text-secondary">
            Crea un borrador desde tu plantilla (montos y firma se ajustan en
            Contratos / portal).
          </p>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Plantilla</span>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full rounded-control bg-nav-hover px-3 py-2.5"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (v{t.version})
                </option>
              ))}
            </select>
          </label>
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={pending || !templateId}
            onClick={createDraft}
          >
            {pending ? "Creando…" : "Crear borrador de contrato"}
          </Button>
        </div>
      ) : (
        <p className="text-center text-[13px] text-text-secondary">
          {canManage
            ? "Crea una plantilla activa en Contratos antes de emitir."
            : "No tienes permiso para crear contratos."}
        </p>
      )}
    </div>
  );
}
