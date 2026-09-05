"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Textarea,
} from "@/src/components/ui";
import {
  createProcessorAction,
  updateProcessorAction,
} from "@/src/actions/processors";
import { playActionResult } from "@/src/lib/cuelume";

export interface ProcessorFormValues {
  name: string;
  type: string;
  websiteUrl: string;
  affiliateUrl: string;
  monthlyPrice: string;
  commission: string;
  instructions: string;
  active: boolean;
}

const EMPTY: ProcessorFormValues = {
  name: "",
  type: "CREDIT_MONITOR",
  websiteUrl: "",
  affiliateUrl: "",
  monthlyPrice: "",
  commission: "",
  instructions: "",
  active: true,
};

export function ProcessorFormButton({
  mode,
  processorId,
  initialValues,
}: {
  mode: "create" | "edit";
  processorId?: string;
  initialValues?: ProcessorFormValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ProcessorFormValues>(initialValues ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setValues(initialValues ?? EMPTY);
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        name: values.name,
        type: values.type || "CREDIT_MONITOR",
        websiteUrl: values.websiteUrl.trim() || null,
        affiliateUrl: values.affiliateUrl.trim() || null,
        monthlyPrice: values.monthlyPrice.trim() || null,
        commission: values.commission.trim() || null,
        instructions: values.instructions.trim() || null,
        active: values.active,
      };
      const result =
        mode === "create"
          ? await createProcessorAction(payload)
          : await updateProcessorAction(processorId as string, payload);
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
      {mode === "create" ? (
        <Button size="sm" onClick={openModal}>
          <Plus className="size-4" aria-hidden />
          Nuevo procesador
        </Button>
      ) : (
        <Button variant="ghost" size="sm" onClick={openModal}>
          <Pencil className="size-3.5" aria-hidden />
          Editar
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={mode === "create" ? "Nuevo procesador" : "Editar procesador"}
        description="Catálogo de procesadores externos (SmartCredit, etc.). No se guardan contraseñas."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Nombre" htmlFor="proc-name" required>
            <Input
              id="proc-name"
              value={values.name}
              onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
              required
              maxLength={150}
              placeholder="Ej. SmartCredit"
            />
          </Field>
          <Field label="Tipo" htmlFor="proc-type">
            <Input
              id="proc-type"
              value={values.type}
              onChange={(e) => setValues((v) => ({ ...v, type: e.target.value }))}
              maxLength={50}
              placeholder="CREDIT_MONITOR"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sitio web" htmlFor="proc-web">
              <Input
                id="proc-web"
                type="url"
                value={values.websiteUrl}
                onChange={(e) =>
                  setValues((v) => ({ ...v, websiteUrl: e.target.value }))
                }
                placeholder="https://"
              />
            </Field>
            <Field label="URL afiliado" htmlFor="proc-aff">
              <Input
                id="proc-aff"
                value={values.affiliateUrl}
                onChange={(e) =>
                  setValues((v) => ({ ...v, affiliateUrl: e.target.value }))
                }
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Precio mensual (USD)" htmlFor="proc-price">
              <Input
                id="proc-price"
                type="number"
                min="0"
                step="0.01"
                value={values.monthlyPrice}
                onChange={(e) =>
                  setValues((v) => ({ ...v, monthlyPrice: e.target.value }))
                }
              />
            </Field>
            <Field label="Comisión (USD)" htmlFor="proc-comm">
              <Input
                id="proc-comm"
                type="number"
                min="0"
                step="0.01"
                value={values.commission}
                onChange={(e) =>
                  setValues((v) => ({ ...v, commission: e.target.value }))
                }
              />
            </Field>
          </div>
          <Field label="Instrucciones" htmlFor="proc-instr">
            <Textarea
              id="proc-instr"
              value={values.instructions}
              onChange={(e) =>
                setValues((v) => ({ ...v, instructions: e.target.value }))
              }
              maxLength={5000}
            />
          </Field>
          {mode === "edit" ? (
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={values.active}
                onChange={(e) =>
                  setValues((v) => ({ ...v, active: e.target.checked }))
                }
                className="size-4 rounded border-border-subtle"
              />
              Activo
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Guardando…"
                : mode === "create"
                  ? "Crear"
                  : "Guardar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
