"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { play } from "cuelume";
import { Package } from "lucide-react";
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
 *
 * `embedded`: formulario inline (sin Modal), p.ej. Avance → Gestión.
 * `open` / `onOpenChange` / `hideTrigger`: modal controlado desde el padre
 * (p.ej. menú Añadir → Servicios sin desmontar al cerrar el menú).
 */
export function CreateCaseButton({
  clientId,
  stages,
  services,
  members,
  menuItem = false,
  label = "Nuevo expediente",
  embedded = false,
  defaultServiceCode,
  lockService = false,
  hideTrigger = false,
  open: openProp,
  onOpenChange,
  stayOnPage = false,
  onCreated,
}: {
  clientId: string;
  stages?: StageOption[];
  services?: ServiceOption[];
  members: { id: string; name: string }[];
  menuItem?: boolean;
  label?: string;
  /** Formulario inline sin Modal ni trigger. */
  embedded?: boolean;
  /** Servicio preseleccionado (p.ej. CREDIT_REPAIR). */
  defaultServiceCode?: string;
  /** Oculta el selector de servicio. */
  lockService?: boolean;
  /** Solo Modal; el padre abre con `open` / `onOpenChange`. */
  hideTrigger?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Tras crear, no navega al expediente. */
  stayOnPage?: boolean;
  onCreated?: (data: {
    serviceCaseId: string;
    caseId: string | null;
    href: string;
  }) => void;
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
  const initialService =
    (defaultServiceCode &&
      options.find((s) => s.code === defaultServiceCode)?.code) ||
    options[0]?.code ||
    "CREDIT_REPAIR";
  const multiService = options.length > 1 && !lockService;

  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  function setOpen(next: boolean) {
    onOpenChange?.(next);
    if (openProp === undefined) setUncontrolledOpen(next);
  }

  const [serviceCode, setServiceCode] = useState(initialService);
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

  function resetForm() {
    setServiceCode(initialService);
    setStageId("");
    setAssignedToId(defaultAssigneeId(members));
    setSummary("");
    setNextActionAt("");
    setError(null);
  }

  function handleClose() {
    setOpen(false);
    setError(null);
  }

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
      resetForm();
      setOpen(false);
      onCreated?.(result.data);
      if (stayOnPage) {
        router.refresh();
        return;
      }
      router.push(result.data.href);
    });
  }

  const form = (
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
      {!multiService && lockService ? (
        <p className="text-xs text-text-secondary">
          Servicio:{" "}
          <span className="font-medium text-ink">
            {selected?.name ?? "Credit Repair"}
          </span>
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
        {!embedded ? (
          <Button
            type="button"
            variant="secondary"
            onClick={handleClose}
            disabled={pending}
          >
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Creando…" : "Crear expediente"}
        </Button>
      </div>
    </form>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div>
          <h4 className="text-[14px] font-semibold text-ink">
            Crear expediente
          </h4>
          <p className="mt-0.5 text-[12px] text-text-secondary">
            Abre un expediente de Credit Repair. Si no eliges etapa, usa la
            primera activa del servicio.
          </p>
        </div>
        {form}
      </div>
    );
  }

  return (
    <>
      {hideTrigger ? null : menuItem ? (
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover"
          onClick={() => setOpen(true)}
        >
          <Package
            className="size-3.5 shrink-0 text-text-secondary"
            aria-hidden
          />
          {label}
        </button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          {label}
        </Button>
      )}
      <Modal
        open={open}
        onClose={handleClose}
        title="Crear expediente"
        description={
          multiService
            ? "Elige el servicio. Si no eliges etapa, usa la primera activa del servicio."
            : "Abre un expediente de Credit Repair. Si no eliges etapa, usa la primera activa del servicio."
        }
      >
        {form}
      </Modal>
    </>
  );
}
