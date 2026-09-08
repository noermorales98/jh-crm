"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePlus, FileText, Plus } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
} from "@/src/components/ui";
import {
  createContractAction,
  upsertContractTemplateAction,
} from "@/src/actions/contracts";
import { playActionResult } from "@/src/lib/cuelume";
import { DocumentEditor } from "@/src/components/contracts/document-editor";
import { TemplateStudioChrome } from "@/src/components/contracts/template-studio-chrome";
import { DEFAULT_CONTRACT_CONTENT } from "@/src/lib/contracts/sanitize";

type ClientOption = { id: string; label: string };
type TemplateOption = { id: string; name: string; version: string };

export function CreateContractButton({
  clients,
  templates,
}: {
  clients: ClientOption[];
  templates: TemplateOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "");
  const [deadlineDays, setDeadlineDays] = useState("3");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const disabled = clients.length === 0 || templates.length === 0;

  function openModal() {
    setClientId(clients[0]?.id ?? "");
    setTemplateId(templates[0]?.id ?? "");
    setDeadlineDays("3");
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createContractAction({
        clientId,
        templateId,
        cancellationDeadlineDays: deadlineDays.trim()
          ? Number(deadlineDays)
          : null,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={openModal} disabled={disabled}>
        <Plus className="size-4" aria-hidden />
        Nuevo contrato
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Crear contrato"
        description="Se genera un borrador desde la plantilla seleccionada."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Cliente" htmlFor="contract-client" required>
            <Select
              id="contract-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Plantilla" htmlFor="contract-template" required>
            <Select
              id="contract-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              required
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} (v{t.version})
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Días de cancelación (opcional)"
            htmlFor="contract-deadline"
          >
            <Input
              id="contract-deadline"
              type="number"
              min="1"
              max="365"
              value={deadlineDays}
              onChange={(e) => setDeadlineDays(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear borrador"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

export function UpsertTemplateButton({
  initial,
}: {
  initial?: {
    id: string;
    name: string;
    version: string;
    contentHtml: string;
    active: boolean;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(initial?.name ?? "");
  const [version, setVersion] = useState(initial?.version ?? "1.0");
  const [contentHtml, setContentHtml] = useState(
    initial?.contentHtml ?? DEFAULT_CONTRACT_CONTENT,
  );
  const [active, setActive] = useState(initial?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const fieldId = initial?.id ?? "new";

  function openModal() {
    setName(initial?.name ?? "");
    setVersion(initial?.version ?? "1.0");
    setContentHtml(initial?.contentHtml ?? DEFAULT_CONTRACT_CONTENT);
    setActive(initial?.active ?? true);
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const plain = contentHtml.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").trim();
    if (!plain) {
      setError("Escribe el contenido del contrato.");
      return;
    }
    startTransition(async () => {
      const result = await upsertContractTemplateAction({
        id: initial?.id,
        name,
        version,
        contentHtml,
        active,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        variant={initial ? "ghost" : "secondary"}
        onClick={openModal}
      >
        {initial ? (
          <FileText className="size-4" aria-hidden />
        ) : (
          <FilePlus className="size-4" aria-hidden />
        )}
        {initial ? "Abrir" : "Nueva plantilla"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="full"
        hideHeader
        title={initial ? "Editar plantilla" : "Nueva plantilla"}
      >
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="jh-doc-chrome shrink-0">
            <TemplateStudioChrome
              title={initial ? "Editar plantilla" : "Nueva plantilla"}
              name={name}
              version={version}
              active={active}
              pending={pending}
              error={error}
              nameId={`tpl-name-${fieldId}`}
              versionId={`tpl-version-${fieldId}`}
              onClose={() => setOpen(false)}
              onNameChange={setName}
              onVersionChange={setVersion}
              onActiveChange={setActive}
            />
          </div>
          {open ? (
            <DocumentEditor
              key={initial?.id ?? "new"}
              value={contentHtml}
              onChange={setContentHtml}
              variant="studio"
            />
          ) : null}
        </form>
      </Modal>
    </>
  );
}
