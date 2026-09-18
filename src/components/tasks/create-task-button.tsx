"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import {
  TASK_PRIORITY_LABELS,
  TASK_TYPE_LABELS,
} from "@/src/lib/labels";
import { createTask } from "@/src/actions/tasks";
import { playActionResult } from "@/src/lib/cuelume";
import { defaultAssigneeId } from "@/src/lib/assignee";

/**
 * Botón + modal para crear una tarea.
 * - Desde /tareas: se puede enlazar un cliente (opcional).
 * - Desde /casos/[id]/tareas: caseId/clientId ya fijos (props).
 */
export function CreateTaskButton({
  members,
  clients,
  fixedClientId,
  fixedCaseId,
  label = "Nueva tarea",
}: {
  members: { id: string; name: string }[];
  clients?: { id: string; label: string }[];
  fixedClientId?: string;
  fixedCaseId?: string;
  label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("FOLLOW_UP");
  const [priority, setPriority] = useState("NORMAL");
  const [dueAt, setDueAt] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [assignedToId, setAssignedToId] = useState(() =>
    defaultAssigneeId(members),
  );
  const [clientId, setClientId] = useState(fixedClientId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setTitle("");
    setDescription("");
    setType("FOLLOW_UP");
    setPriority("NORMAL");
    setDueAt("");
    setReminderAt("");
    setAssignedToId(defaultAssigneeId(members));
    setClientId(fixedClientId ?? "");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createTask({
        title,
        ...(description.trim() ? { description: description.trim() } : {}),
        type,
        priority,
        ...(dueAt ? { dueAt } : {}),
        ...(reminderAt ? { reminderAt } : {}),
        assignedToId,
        ...(fixedClientId
          ? { clientId: fixedClientId }
          : clientId
            ? { clientId }
            : {}),
        ...(fixedCaseId ? { caseId: fixedCaseId } : {}),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Crear tarea">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Título" htmlFor="task-title" required>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="Ej. Llamar al cliente para confirmar documentos"
            />
          </Field>
          <Field label="Descripción" htmlFor="task-description">
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={5000}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo" htmlFor="task-type">
              <Select
                id="task-type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {Object.entries(TASK_TYPE_LABELS).map(([value, lbl]) => (
                  <option key={value} value={value}>
                    {lbl}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Prioridad" htmlFor="task-priority">
              <Select
                id="task-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {Object.entries(TASK_PRIORITY_LABELS).map(([value, lbl]) => (
                  <option key={value} value={value}>
                    {lbl}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Vence" htmlFor="task-due">
              <DateInput
                id="task-due"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </Field>
            <Field label="Recordatorio" htmlFor="task-reminder">
              <DateInput
                id="task-reminder"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
              />
            </Field>
            {clients && !fixedClientId ? (
              <Field label="Cliente (opcional)" htmlFor="task-client">
                <Select
                  id="task-client"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                >
                  <option value="">Sin cliente</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Creando…" : "Crear tarea"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
