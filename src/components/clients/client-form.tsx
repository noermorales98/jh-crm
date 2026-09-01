"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Select } from "@/src/components/ui";
import { CLIENT_STATUS_LABELS } from "@/src/lib/labels";
import { createClient, updateClient } from "@/src/actions/clients";

export interface ClientFormValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  source: string;
  status: string;
  assignedToId: string;
}

export const EMPTY_CLIENT_VALUES: ClientFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  source: "",
  status: "LEAD",
  assignedToId: "",
};

/**
 * Formulario de cliente (alta y edición).
 * - mode="create": llama createClient y redirige al resumen del cliente.
 * - mode="edit": llama updateClient(clientId) y refresca.
 */
export function ClientForm({
  mode,
  clientId,
  initialValues = EMPTY_CLIENT_VALUES,
  members,
}: {
  mode: "create" | "edit";
  clientId?: string;
  initialValues?: ClientFormValues;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<ClientFormValues>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function set<K extends keyof ClientFormValues>(key: K, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const payload = {
        firstName: values.firstName,
        lastName: values.lastName,
        email: values.email,
        phone: values.phone,
        addressLine1: values.addressLine1,
        addressLine2: values.addressLine2,
        city: values.city,
        state: values.state,
        postalCode: values.postalCode,
        source: values.source,
        ...(mode === "edit" ? { status: values.status } : {}),
        ...(values.assignedToId ? { assignedToId: values.assignedToId } : {}),
      };
      const result =
        mode === "create"
          ? await createClient(payload)
          : await updateClient(clientId as string, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (mode === "create") {
        router.push(`/crm/clientes/${result.data.id}`);
      } else {
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor="firstName" required>
          <Input
            id="firstName"
            value={values.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            required
            maxLength={100}
            autoComplete="given-name"
          />
        </Field>
        <Field label="Apellido" htmlFor="lastName">
          <Input
            id="lastName"
            value={values.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            maxLength={100}
            autoComplete="family-name"
          />
        </Field>
        <Field label="Correo electrónico" htmlFor="email">
          <Input
            id="email"
            type="email"
            value={values.email}
            onChange={(e) => set("email", e.target.value)}
            autoComplete="email"
          />
        </Field>
        <Field label="Teléfono" htmlFor="phone" hint="Ej. +1 555 123 4567">
          <Input
            id="phone"
            type="tel"
            value={values.phone}
            onChange={(e) => set("phone", e.target.value)}
            autoComplete="tel"
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Dirección" htmlFor="addressLine1" className="sm:col-span-2">
          <Input
            id="addressLine1"
            value={values.addressLine1}
            onChange={(e) => set("addressLine1", e.target.value)}
            maxLength={200}
            autoComplete="address-line1"
          />
        </Field>
        <Field label="Dirección (línea 2)" htmlFor="addressLine2" className="sm:col-span-2">
          <Input
            id="addressLine2"
            value={values.addressLine2}
            onChange={(e) => set("addressLine2", e.target.value)}
            maxLength={200}
            autoComplete="address-line2"
          />
        </Field>
        <Field label="Ciudad" htmlFor="city">
          <Input
            id="city"
            value={values.city}
            onChange={(e) => set("city", e.target.value)}
            maxLength={100}
            autoComplete="address-level2"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Estado (EE. UU.)" htmlFor="state" hint="2 letras, ej. TX">
            <Input
              id="state"
              value={values.state}
              onChange={(e) => set("state", e.target.value.toUpperCase())}
              maxLength={2}
              autoComplete="address-level1"
            />
          </Field>
          <Field label="Código postal" htmlFor="postalCode">
            <Input
              id="postalCode"
              value={values.postalCode}
              onChange={(e) => set("postalCode", e.target.value)}
              autoComplete="postal-code"
            />
          </Field>
        </div>
        <Field label="Fuente" htmlFor="source" hint="¿Cómo llegó? (referido, web…)" >
          <Input
            id="source"
            value={values.source}
            onChange={(e) => set("source", e.target.value)}
            maxLength={100}
          />
        </Field>
        <Field label="Responsable" htmlFor="assignedToId">
          <Select
            id="assignedToId"
            value={values.assignedToId}
            onChange={(e) => set("assignedToId", e.target.value)}
          >
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        {mode === "edit" ? (
          <Field label="Estado del cliente" htmlFor="status">
            <Select
              id="status"
              value={values.status}
              onChange={(e) => set("status", e.target.value)}
            >
              {Object.entries(CLIENT_STATUS_LABELS)
                .filter(([value]) => value !== "ARCHIVED")
                .map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
      </div>

      <div className="flex items-center gap-2 border-t border-border-subtle pt-4">
        <Button type="submit" disabled={pending}>
          {pending
            ? "Guardando…"
            : mode === "create"
              ? "Crear cliente"
              : "Guardar cambios"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
