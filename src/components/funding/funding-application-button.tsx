"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, DateInput, Field, Input, Modal, Select, Textarea } from "@/src/components/ui";
import { FUNDING_APPLICATION_STATUS_LABELS } from "@/src/lib/labels";
import { playActionResult } from "@/src/lib/cuelume";
import { createFundingApplicationAction, updateFundingApplicationAction } from "@/src/actions/funding";

export interface FundingApplicationView {
  id: string;
  lenderName: string;
  requestedAmount: string | null;
  approvedAmount: string | null;
  status: string;
  submittedAt: string | null;
  decisionAt: string | null;
  notes: string | null;
  updatedAt: string;
}
export function FundingApplicationButton({ serviceCaseId, initial }: { serviceCaseId: string; initial?: FundingApplicationView }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button size="sm" variant={initial ? "secondary" : "primary"} onClick={() => setOpen(true)}>{initial ? "Editar" : "Nueva aplicación"}</Button>
    <Modal open={open} onClose={() => setOpen(false)} title={initial ? "Editar aplicación" : "Nueva aplicación a prestamista"} description="Registra el estado y los montos reales de esta aplicación.">
      {open ? <ApplicationForm serviceCaseId={serviceCaseId} initial={initial} onClose={() => setOpen(false)} /> : null}
    </Modal>
  </>;
}
function ApplicationForm({ serviceCaseId, initial, onClose }: { serviceCaseId: string; initial?: FundingApplicationView; onClose: () => void }) {
  const uid = useId(); const router = useRouter(); const [pending, startTransition] = useTransition(); const [error, setError] = useState<string | null>(null);
  return <form className="space-y-4" onSubmit={event => {
    event.preventDefault(); const values = new FormData(event.currentTarget);
    const input = { lenderName: String(values.get("lenderName")), requestedAmount: String(values.get("requestedAmount") || "") || null, approvedAmount: String(values.get("approvedAmount") || "") || null, status: String(values.get("status")), submittedAt: String(values.get("submittedAt") || "") || null, decisionAt: String(values.get("decisionAt") || "") || null, notes: String(values.get("notes") || "") || null };
    setError(null);
    startTransition(async () => {
      const result = initial ? await updateFundingApplicationAction(serviceCaseId, initial.id, initial.updatedAt, input) : await createFundingApplicationAction(serviceCaseId, input);
      playActionResult(result.ok);
      if (!result.ok) { setError(result.error); return; }
      onClose(); router.refresh();
    });
  }}>
    {error ? <Alert tone="error">{error}</Alert> : null}
    <Field label="Prestamista" htmlFor={`${uid}-lender`} required><Input id={`${uid}-lender`} name="lenderName" required maxLength={191} defaultValue={initial?.lenderName} disabled={pending} /></Field>
    <Field label="Estado" htmlFor={`${uid}-status`}><Select id={`${uid}-status`} name="status" defaultValue={initial?.status ?? "DRAFT"} disabled={pending} options={Object.entries(FUNDING_APPLICATION_STATUS_LABELS).map(([value, label]) => ({ value, label }))} /></Field>
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Monto solicitado (USD)" htmlFor={`${uid}-requested`}><Input id={`${uid}-requested`} name="requestedAmount" inputMode="decimal" placeholder="0.00" maxLength={13} defaultValue={initial?.requestedAmount ?? ""} disabled={pending} /></Field>
      <Field label="Monto aprobado (USD)" htmlFor={`${uid}-approved`}><Input id={`${uid}-approved`} name="approvedAmount" inputMode="decimal" placeholder="0.00" maxLength={13} defaultValue={initial?.approvedAmount ?? ""} disabled={pending} /></Field>
      <Field label="Fecha de envío" htmlFor={`${uid}-submitted`}><DateInput id={`${uid}-submitted`} name="submittedAt" defaultValue={initial?.submittedAt?.slice(0, 10) ?? ""} disabled={pending} /></Field>
      <Field label="Fecha de decisión" htmlFor={`${uid}-decision`}><DateInput id={`${uid}-decision`} name="decisionAt" defaultValue={initial?.decisionAt?.slice(0, 10) ?? ""} disabled={pending} /></Field>
    </div>
    <Field label="Notas" htmlFor={`${uid}-notes`}><Textarea id={`${uid}-notes`} name="notes" maxLength={5000} defaultValue={initial?.notes ?? ""} disabled={pending} /></Field>
    <p className="text-xs text-text-secondary">Para retirar una aplicación, usa el estado Retirada. El registro se conserva para seguimiento.</p>
    <div className="flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar aplicación"}</Button></div>
  </form>;
}
