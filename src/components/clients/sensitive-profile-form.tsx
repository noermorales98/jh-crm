"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Input,
  Textarea,
} from "@/src/components/ui";
import { updateSensitiveProfile } from "@/src/actions/clients";
import { playActionResult } from "@/src/lib/cuelume";

/**
 * Formulario del perfil sensible (SSN, fecha de nacimiento, licencia, notas).
 * Solo se renderiza si el usuario tiene sensitive.edit (decidido en servidor).
 *
 * Contrato del backend: updateSensitiveProfile guarda los 4 campos juntos —
 * un campo vacío elimina el valor previo. El formulario lo advierte y no
 * muestra valores descifrados: solo el SSN enmascarado.
 */
export function SensitiveProfileForm({
  clientId,
  ssnMasked,
  updatedAt,
}: {
  clientId: string;
  ssnMasked: string | null;
  updatedAt: string | null;
}) {
  const router = useRouter();
  const [ssn, setSsn] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [driversLicenseNumber, setDriversLicenseNumber] = useState("");
  const [sensitiveNotes, setSensitiveNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateSensitiveProfile(clientId, {
        ssn,
        dateOfBirth: dateOfBirth || undefined,
        driversLicenseNumber,
        sensitiveNotes,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setSuccess(
        `Perfil sensible guardado. SSN actual: ${result.data.ssnMasked ?? "no registrado"}.`,
      );
      setSsn("");
      setDateOfBirth("");
      setDriversLicenseNumber("");
      setSensitiveNotes("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

      <p className="text-xs leading-relaxed text-text-secondary">
        Los valores guardados no se muestran descifrados. Un campo vacío elimina
        el valor previo.
        {ssnMasked ? ` SSN actual: ${ssnMasked}.` : " SSN no registrado."}
        {updatedAt ? ` Actualizado ${updatedAt}.` : ""}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="SSN" htmlFor="ssn">
          <Input
            id="ssn"
            value={ssn}
            onChange={(e) => setSsn(e.target.value)}
            placeholder="123-45-6789"
            autoComplete="off"
            inputMode="numeric"
          />
        </Field>
        <Field label="Fecha de nacimiento" htmlFor="dateOfBirth">
          <DateInput
            id="dateOfBirth"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </Field>
        <Field label="Número de licencia" htmlFor="driversLicenseNumber">
          <Input
            id="driversLicenseNumber"
            value={driversLicenseNumber}
            onChange={(e) => setDriversLicenseNumber(e.target.value)}
            maxLength={50}
            autoComplete="off"
          />
        </Field>
        <Field label="Notas sensibles" htmlFor="sensitiveNotes">
          <Textarea
            id="sensitiveNotes"
            value={sensitiveNotes}
            onChange={(e) => setSensitiveNotes(e.target.value)}
            maxLength={2000}
            rows={2}
          />
        </Field>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Guardando…" : "Guardar perfil sensible"}
        </Button>
      </div>
    </form>
  );
}
