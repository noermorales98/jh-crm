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
import { createService, updateService } from "@/src/actions/services";

export interface ServiceFormValues {
  name: string;
  description: string;
  defaultPrice: string;
}

const EMPTY_VALUES: ServiceFormValues = {
  name: "",
  description: "",
  defaultPrice: "",
};

/** Botón + modal para crear o editar un servicio del catálogo. */
export function ServiceFormButton({
  mode,
  serviceId,
  initialValues,
}: {
  mode: "create" | "edit";
  serviceId?: string;
  initialValues?: ServiceFormValues;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<ServiceFormValues>(
    initialValues ?? EMPTY_VALUES,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setValues(initialValues ?? EMPTY_VALUES);
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        name: values.name,
        description: values.description.trim() ? values.description.trim() : null,
        defaultPrice: values.defaultPrice,
      };
      const result =
        mode === "create"
          ? await createService(payload)
          : await updateService(serviceId as string, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" onClick={openModal}>
          <Plus className="size-4" aria-hidden />
          Nuevo servicio
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
        title={mode === "create" ? "Nuevo servicio" : "Editar servicio"}
        description="El precio es el valor por defecto; cada cotización puede ajustarlo."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Nombre" htmlFor="service-name" required>
            <Input
              id="service-name"
              value={values.name}
              onChange={(e) =>
                setValues((v) => ({ ...v, name: e.target.value }))
              }
              required
              maxLength={150}
              placeholder="Ej. Disputa de burós de crédito"
            />
          </Field>
          <Field label="Descripción" htmlFor="service-description">
            <Textarea
              id="service-description"
              value={values.description}
              onChange={(e) =>
                setValues((v) => ({ ...v, description: e.target.value }))
              }
              maxLength={2000}
            />
          </Field>
          <Field
            label="Precio por defecto (USD)"
            htmlFor="service-price"
            required
          >
            <Input
              id="service-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={values.defaultPrice}
              onChange={(e) =>
                setValues((v) => ({ ...v, defaultPrice: e.target.value }))
              }
              required
              placeholder="0.00"
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
              {pending
                ? "Guardando…"
                : mode === "create"
                  ? "Crear servicio"
                  : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
