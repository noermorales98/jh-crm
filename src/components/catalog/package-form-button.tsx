"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import { createPackage, updatePackage } from "@/src/actions/services";
import { playActionResult } from "@/src/lib/cuelume";

export interface PackageServiceOption {
  id: string;
  name: string;
  defaultPrice: number;
}

export interface PackageItemValue {
  serviceId: string;
  quantity: string;
}

export interface PackageFormValues {
  name: string;
  description: string;
  defaultPrice: string;
  items: PackageItemValue[];
}

const EMPTY_VALUES: PackageFormValues = {
  name: "",
  description: "",
  defaultPrice: "",
  items: [],
};

/**
 * Botón + modal para crear o editar un paquete con su selector de
 * servicios y cantidad por servicio.
 */
export function PackageFormButton({
  mode,
  packageId,
  initialValues,
  services,
}: {
  mode: "create" | "edit";
  packageId?: string;
  initialValues?: PackageFormValues;
  services: PackageServiceOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PackageFormValues>(
    initialValues ?? EMPTY_VALUES,
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setValues(
      initialValues
        ? { ...initialValues, items: initialValues.items.map((i) => ({ ...i })) }
        : EMPTY_VALUES,
    );
    setError(null);
    setOpen(true);
  }

  function setItem(index: number, patch: Partial<PackageItemValue>) {
    setValues((v) => ({
      ...v,
      items: v.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    }));
  }

  function addItem() {
    const available = services.filter(
      (s) => !values.items.some((i) => i.serviceId === s.id),
    );
    if (available.length === 0) return;
    setValues((v) => ({
      ...v,
      items: [...v.items, { serviceId: available[0].id, quantity: "1" }],
    }));
  }

  function removeItem(index: number) {
    setValues((v) => ({ ...v, items: v.items.filter((_, i) => i !== index) }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (values.items.length === 0) {
      setError("Agrega al menos un servicio al paquete.");
      return;
    }
    startTransition(async () => {
      const payload = {
        name: values.name,
        description: values.description.trim() ? values.description.trim() : null,
        defaultPrice: values.defaultPrice,
        items: values.items.map((item) => ({
          serviceId: item.serviceId,
          quantity: Number(item.quantity),
        })),
      };
      const result =
        mode === "create"
          ? await createPackage(payload)
          : await updatePackage(packageId as string, payload);
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
          Nuevo paquete
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
        title={mode === "create" ? "Nuevo paquete" : "Editar paquete"}
        description="Agrupa servicios con un precio de paquete. Al editar, los ítems se reemplazan por completo."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Nombre" htmlFor="package-name" required>
            <Input
              id="package-name"
              value={values.name}
              onChange={(e) =>
                setValues((v) => ({ ...v, name: e.target.value }))
              }
              required
              maxLength={150}
              placeholder="Ej. Paquete completo 6 meses"
            />
          </Field>
          <Field label="Descripción" htmlFor="package-description">
            <Textarea
              id="package-description"
              value={values.description}
              onChange={(e) =>
                setValues((v) => ({ ...v, description: e.target.value }))
              }
              maxLength={2000}
            />
          </Field>
          <Field
            label="Precio del paquete (USD)"
            htmlFor="package-price"
            required
          >
            <Input
              id="package-price"
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

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary-strong">
                Servicios incluidos<span className="ml-0.5 text-red-500">*</span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={addItem}
                disabled={values.items.length >= services.length}
              >
                <Plus className="size-3.5" aria-hidden />
                Agregar servicio
              </Button>
            </div>
            {values.items.length === 0 ? (
              <p className="rounded-control border border-dashed border-border-subtle px-3 py-3 text-xs text-text-secondary">
                Aún no hay servicios en el paquete.
              </p>
            ) : (
              <ul className="space-y-2">
                {values.items.map((item, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Select
                      aria-label={`Servicio ${index + 1}`}
                      value={item.serviceId}
                      onChange={(e) => setItem(index, { serviceId: e.target.value })}
                    >
                      {services.map((s) => (
                        <option
                          key={s.id}
                          value={s.id}
                          disabled={
                            s.id !== item.serviceId &&
                            values.items.some((i) => i.serviceId === s.id)
                          }
                        >
                          {s.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      aria-label={`Cantidad ${index + 1}`}
                      type="number"
                      min="1"
                      step="1"
                      className="w-20 shrink-0"
                      value={item.quantity}
                      onChange={(e) => setItem(index, { quantity: e.target.value })}
                      required
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeItem(index)}
                      aria-label="Quitar servicio"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

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
                  ? "Crear paquete"
                  : "Guardar cambios"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
