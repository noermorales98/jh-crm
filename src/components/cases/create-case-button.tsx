"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import { createCreditCase } from "@/src/actions/cases";

export interface StageOption {
  id: string;
  name: string;
  color: string;
}

/**
 * Botón + modal para crear un caso (clientId ya conocido desde la página
 * del cliente). stageId opcional: el backend usa la primera etapa activa.
 */
export function CreateCaseButton({
  clientId,
  stages,
  members,
}: {
  clientId: string;
  stages: StageOption[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stageId, setStageId] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [summary, setSummary] = useState("");
  const [nextReviewAt, setNextReviewAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createCreditCase({
        clientId,
        ...(stageId ? { stageId } : {}),
        ...(assignedToId ? { assignedToId } : {}),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(nextReviewAt ? { nextReviewAt } : {}),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.push(`/crm/casos/${result.data.id}`);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Nuevo caso
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Crear caso de reparación de crédito"
        description="El caso inicia en la primera etapa activa si no eliges otra."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Etapa inicial" htmlFor="case-stage">
              <Select
                id="case-stage"
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
              >
                <option value="">Primera etapa activa</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Responsable" htmlFor="case-assignee">
              <Select
                id="case-assignee"
                value={assignedToId}
                onChange={(e) => setAssignedToId(e.target.value)}
              >
                <option value="">Sin asignar</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Próxima revisión" htmlFor="case-review">
              <DateInput
                id="case-review"
                value={nextReviewAt}
                onChange={(e) => setNextReviewAt(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Resumen" htmlFor="case-summary">
            <Textarea
              id="case-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={5000}
              placeholder="Situación del cliente, objetivos del caso…"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear caso"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
