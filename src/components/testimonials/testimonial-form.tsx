"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea, Select } from "@/src/components/ui";
import { playActionResult } from "@/src/lib/cuelume";
import { TESTIMONIAL_CONSENT_TEXT } from "@/src/lib/testimonials";
import {
  createTestimonialAction,
  changeTestimonialAction,
  changePortalTestimonialAction,
  submitPortalTestimonialAction,
} from "@/src/actions/testimonials";

type Initial = {
  id: string;
  updatedAt: string;
  displayName: string;
  body: string;
  rating: number | null;
  serviceCaseId: string | null;
};
export function TestimonialForm({
  clientId,
  defaultName = "",
  cases,
  initial,
  portal = false,
  onSaved,
}: {
  clientId: string;
  defaultName?: string;
  cases: { id: string; label: string }[];
  initial?: Initial;
  portal?: boolean;
  onSaved?: () => void;
}) {
  const uid = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const data = {
          clientId,
          displayName: String(values.get("displayName")),
          body: String(values.get("body")),
          rating: values.get("rating") ? Number(values.get("rating")) : null,
          serviceCaseId: String(values.get("serviceCaseId") || "") || null,
        };
        setError(null);
        setNotice(null);
        startTransition(async () => {
          const result = initial
            ? await (
                portal ? changePortalTestimonialAction : changeTestimonialAction
              )(initial.id, initial.updatedAt, { kind: "edit", data })
            : portal
              ? await submitPortalTestimonialAction({
                  ...data,
                  accepted: values.get("accepted") === "on",
                  signerName: String(values.get("signerName")),
                })
              : await createTestimonialAction(data);
          playActionResult(result.ok);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setNotice(
            initial
              ? "Cambios guardados. Se requiere nuevo consentimiento y revisión."
              : portal
                ? "Testimonio enviado para revisión."
                : "Testimonio creado. Registra el consentimiento antes de aprobarlo.",
          );
          if (!initial) form.reset();
          onSaved?.();
          router.refresh();
        });
      }}
    >
      <Field
        label="Nombre público"
        htmlFor={`${uid}-name`}
        required
        hint="Se publicará exactamente este nombre."
      >
        <Input
          id={`${uid}-name`}
          name="displayName"
          required
          maxLength={120}
          defaultValue={initial?.displayName ?? defaultName}
          disabled={pending}
        />
      </Field>
      <Field label="Testimonio" htmlFor={`${uid}-body`} required>
        <Textarea
          id={`${uid}-body`}
          name="body"
          required
          maxLength={5000}
          rows={4}
          defaultValue={initial?.body}
          disabled={pending}
        />
      </Field>
      <Field label="Calificación (opcional)" htmlFor={`${uid}-rating`}>
        <Input
          id={`${uid}-rating`}
          name="rating"
          type="number"
          min={1}
          max={5}
          step={1}
          defaultValue={initial?.rating ?? ""}
          disabled={pending}
        />
      </Field>
      <Field label="Expediente (opcional)" htmlFor={`${uid}-case`}>
        <Select
          id={`${uid}-case`}
          name="serviceCaseId"
          defaultValue={initial?.serviceCaseId ?? ""}
          disabled={pending}
          className="w-full rounded-control border border-border-subtle bg-surface-elevated p-2 text-sm"
        >
          <option value="">General del cliente</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      {portal && !initial ? (
        <>
          <Field
            label="Nombre de quien autoriza"
            htmlFor={`${uid}-signer`}
            required
          >
            <Input
              id={`${uid}-signer`}
              name="signerName"
              required
              maxLength={120}
              defaultValue={defaultName}
              disabled={pending}
            />
          </Field>
          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input
              name="accepted"
              type="checkbox"
              required
              disabled={pending}
              className="mt-1"
            />
            <span>{TESTIMONIAL_CONSENT_TEXT}</span>
          </label>
        </>
      ) : null}
      {initial ? (
        <p className="text-sm text-text-secondary">
          Guardar cambios retira la publicación y exige nuevo consentimiento y
          aprobación.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-danger-ink">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-success-ink">
          {notice}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Guardando…"
          : initial
            ? "Guardar cambios"
            : portal
              ? "Enviar testimonio"
              : "Crear testimonio"}
      </Button>
    </form>
  );
}
