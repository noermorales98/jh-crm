"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Pencil, Plus } from "lucide-react";
import {
  Alert,
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  Pill,
  StagePill,
} from "@/src/components/ui";
import { playActionResult } from "@/src/lib/cuelume";
import {
  createStage,
  deactivateStage,
  reorderStages,
  updateStage,
} from "@/src/actions/config";

export interface StageRow {
  id: string;
  key: string;
  name: string;
  color: string;
  isTerminal: boolean;
  isActive: boolean;
}

/**
 * Gestor de etapas del flujo: alta, edición, reordenar (↑↓) y
 * desactivar. reorderStages exige la lista completa de IDs.
 */
export function StagesManager({ stages }: { stages: StageRow[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Modal de alta/edición
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<StageRow | null>(null);
  const [form, setForm] = useState({ key: "", name: "", color: "#64748B", isTerminal: false });
  const [formError, setFormError] = useState<string | null>(null);

  const activeCount = stages.filter((s) => s.isActive).length;

  function openCreate() {
    setEditing(null);
    setForm({ key: "", name: "", color: "#64748B", isTerminal: false });
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(stage: StageRow) {
    setEditing(stage);
    setForm({
      key: stage.key,
      name: stage.name,
      color: stage.color,
      isTerminal: stage.isTerminal,
    });
    setFormError(null);
    setModalOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    startTransition(async () => {
      const payload = {
        key: form.key.trim().toUpperCase(),
        name: form.name.trim(),
        color: form.color,
        isTerminal: form.isTerminal,
      };
      const result = editing
        ? await updateStage(editing.id, payload)
        : await createStage(payload);
      if (!result.ok) {
        playActionResult(false);
        setFormError(result.error);
        return;
      }
      playActionResult(true);
      setModalOpen(false);
      router.refresh();
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const ordered = [...stages];
    const [item] = ordered.splice(index, 1);
    ordered.splice(target, 0, item);
    setError(null);
    startTransition(async () => {
      const result = await reorderStages({ orderedIds: ordered.map((s) => s.id) });
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
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Alert tone="info">
        Siempre debe quedar <strong>al menos una etapa activa</strong>; el
        sistema bloquea desactivar la última. Los casos que usan una etapa
        desactivada conservan su etapa actual.
      </Alert>

      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          Nueva etapa
        </Button>
      </div>

      <ul className="divide-y divide-border-subtle overflow-hidden rounded-surface border border-border-subtle">
        {stages.map((stage, index) => (
          <li key={stage.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-col">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => move(index, -1)}
                disabled={pending || index === 0}
                aria-label={`Subir ${stage.name}`}
              >
                <ArrowUp className="size-3.5" aria-hidden />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => move(index, 1)}
                disabled={pending || index === stages.length - 1}
                aria-label={`Bajar ${stage.name}`}
              >
                <ArrowDown className="size-3.5" aria-hidden />
              </Button>
            </div>
            <span className="w-6 shrink-0 text-center text-[13px] tabular-nums text-text-secondary">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <StagePill name={stage.name} color={stage.color} />
                {stage.isTerminal ? <Pill tone="indigo">Terminal</Pill> : null}
              </div>
              <p className="mt-1 font-mono text-[12px] text-text-secondary">{stage.key}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {stage.isActive ? (
                <Pill tone="green">Activa</Pill>
              ) : (
                <Pill tone="slate">Inactiva</Pill>
              )}
              <Button variant="ghost" size="sm" onClick={() => openEdit(stage)}>
                <Pencil className="size-3.5" aria-hidden />
                Editar
              </Button>
              {stage.isActive && activeCount > 1 ? (
                <ConfirmDialog
                  title="Desactivar etapa"
                  message={
                    <>
                      La etapa <strong>{stage.name}</strong> dejará de ofrecerse
                      para casos nuevos. Los casos que la usan la conservan.
                    </>
                  }
                  confirmLabel="Desactivar"
                  danger
                  trigger={
                    <Button variant="ghost" size="sm">
                      Desactivar
                    </Button>
                  }
                  onConfirm={async () => {
                    const result = await deactivateStage(stage.id);
                    if (!result.ok) return result.error;
                    router.refresh();
                  }}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar etapa ${editing.name}` : "Nueva etapa"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? <Alert tone="error">{formError}</Alert> : null}
          <Field
            label="Clave"
            htmlFor="stage-key"
            required
            hint="MAYÚSCULAS_CON_GUIONES_BAJOS, ej. EN_REVISION."
          >
            <Input
              id="stage-key"
              value={form.key}
              onChange={(e) =>
                setForm((f) => ({ ...f, key: e.target.value.toUpperCase() }))
              }
              required
              maxLength={40}
              placeholder="EN_REVISION"
            />
          </Field>
          <Field label="Nombre visible" htmlFor="stage-name" required>
            <Input
              id="stage-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
              maxLength={100}
              placeholder="En revisión"
            />
          </Field>
          <Field label="Color" htmlFor="stage-color">
            <div className="flex items-center gap-3">
              <input
                id="stage-color"
                type="color"
                value={form.color}
                onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                className="h-10 w-16 cursor-pointer rounded-control border border-border-subtle bg-surface-elevated p-1"
              />
              <span className="font-mono text-[12px] uppercase text-text-secondary">
                {form.color}
              </span>
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm text-text-secondary-strong">
            <input
              type="checkbox"
              checked={form.isTerminal}
              onChange={(e) =>
                setForm((f) => ({ ...f, isTerminal: e.target.checked }))
              }
              className="size-4 rounded border-border-subtle text-action-primary focus:ring-focus"
            />
            Es etapa terminal (el caso termina aquí)
          </label>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setModalOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : editing ? "Guardar cambios" : "Crear etapa"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
