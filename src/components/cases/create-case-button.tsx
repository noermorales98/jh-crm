"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { play } from "cuelume";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import { createServiceCaseAction } from "@/src/actions/service-cases";
import { defaultAssigneeId } from "@/src/lib/assignee";

export interface StageOption {
  id: string;
  name: string;
  color: string;
}

export interface ServiceOption {
  code: string;
  name: string;
  stages: StageOption[];
}

/**
 * Botón + modal para crear un expediente (clientId ya conocido desde la
 * página del cliente). Con `services` permite elegir el vertical (Fase 5);
 * sin él se comporta como antes: Credit Repair con las etapas de `stages`.
 * stageId opcional: el backend usa la primera etapa activa del servicio.
 */
export function CreateCaseButton({
  clientId,
  stages,
  services,
  members,
}: {
  clientId: string;
  stages?: StageOption[];
  services?: ServiceOption[];
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const options: ServiceOption[] = useMemo(
    () =>
      services && services.length > 0
        ? services
        : [
            {
              code: "CREDIT_REPAIR",
              name: "Credit Repair",
              stages: stages ?? [],
            },
          ],
    [services, stages],
  );
  const multiService = options.length > 1;

  const [open, setOpen] = useState(false);
  const [serviceCode, setServiceCode] = useState(options[0]?.code ?? "CREDIT_REPAIR");
  const [stageId, setStageId] = useState("");
  const [assignedToId, setAssignedToId] = useState(() =>
    defaultAssigneeId(members),
  );
  const [summary, setSummary] = useState("");
  const [nextActionAt, setNextActionAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selected = options.find((s) => s.code === serviceCode) ?? options[0];
  const stageOptions = selected?.stages ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createServiceCaseAction({
        clientId,
        serviceCode: selected?.code ?? "CREDIT_REPAIR",
        ...(stageId ? { stageId } : {}),
        ...(assignedToId ? { assignedToId } : {}),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(nextActionAt ? { nextActionAt } : {}),
      });
      if (!result.ok) {
        play("error");
        setError(result.error);
        return;
      }
      play("success");
      setOpen(false);
      router.push(result.data.href);
    });
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Nuevo expediente
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Crear expediente"
        description={
          multiService
            ? "Elige el servicio. Si no eliges etapa, usa la primera activa del servicio."
            : "Abre un expediente de Credit Repair. Si no eliges etapa, usa la primera activa del servicio."
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {multiService ? (
              <Field label="Servicio" htmlFor="case-service">
                <Select
                  id="case-service"
                  value={serviceCode}
                  onChange={(e) => {
                    setServiceCode(e.target.value);
                    setStageId("");
                  }}
                >
                  {options.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            {stageOptions.length > 0 ? (
              <Field label="Etapa inicial" htmlFor="case-stage">
                <Select
                  id="case-stage"
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                >
                  <option value="">Primera etapa activa</option>
                  {stageOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <Field label="Próxima acción" htmlFor="case-next-action">
              <DateInput
                id="case-next-action"
                value={nextActionAt}
                onChange={(e) => setNextActionAt(e.target.value)}
                pickerTitle="Elegir fecha de próxima acción"
              />
            </Field>
          </div>
          {multiService && stageOptions.length === 0 ? (
            <p className="text-xs text-text-secondary">
              Este servicio aún no tiene etapas: se crearán las etapas por
              defecto al abrir el expediente.
            </p>
          ) : null}
          <Field label="Resumen" htmlFor="case-summary">
            <Textarea
              id="case-summary"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              maxLength={5000}
              placeholder="Situación del cliente, objetivos del expediente…"
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
              {pending ? "Creando…" : "Crear expediente"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
