"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContractAction,
  markContractSentAction,
} from "@/src/actions/contracts";
import { Button, Select } from "@/src/components/ui";
import { DocumentView } from "@/src/components/contracts/document-editor";
import { playActionResult } from "@/src/lib/cuelume";

export function ClientContractHubPanel({
  clientId,
  contractId,
  contractStatus,
  statusLabel,
  templates,
  canManage,
  clientName,
}: {
  clientId: string;
  contractId: string | null;
  contractStatus: string | null;
  statusLabel: string;
  templates: { id: string; name: string; version: string; contentHtml: string }[];
  canManage: boolean;
  clientName: string;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const template = templates.find((t) => t.id === templateId) ?? null;
  // Igual que al emitir: el nombre del cliente sustituye a la variable.
  const previewHtml = useMemo(
    () =>
      template
        ? template.contentHtml
            .replaceAll("{{clientName}}", clientName)
            .replaceAll("{{clientFullName}}", clientName)
        : "",
    [template, clientName],
  );

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
        <div className="space-y-4">
          <div className="rounded-surface bg-surface-app px-4 py-3">
            <p className="text-[14px] font-semibold text-ink">Este cliente aún no tiene contrato</p>
            <p className="mt-0.5 text-[12.5px] text-text-secondary">
              Así se verá con la plantilla elegida. Al crearlo queda como borrador; montos y firma se ajustan en
              Contratos.
            </p>
          </div>
          {templates.length > 1 ? (
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium text-ink">Plantilla</span>
              <Select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                pickerTitle="Elegir plantilla"
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} (v{t.version})
                  </option>
                ))}
              </Select>
            </label>
          ) : (
            <p className="text-[12.5px] text-text-secondary">
              Plantilla: <span className="font-medium text-ink">{template?.name}</span> (v{template?.version})
            </p>
          )}
          {template ? (
            <div>
              <p className="mb-1.5 text-[12px] font-medium text-text-secondary">Vista previa</p>
              <DocumentView html={previewHtml} />
            </div>
          ) : null}
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
            ? "Este cliente aún no tiene contrato y no hay una plantilla activa. Crea una en Contratos para verla aquí."
            : "No tienes permiso para crear contratos."}
        </p>
      )}
    </div>
  );
}
