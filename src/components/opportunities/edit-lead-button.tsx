"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Input,
  Modal,
  Select,
} from "@/src/components/ui";
import { updateLeadAction } from "@/src/actions/opportunities";
import { playActionResult } from "@/src/lib/cuelume";
import { LEAD_CHANNEL_LABELS } from "@/src/lib/labels";

type MemberOption = { id: string; name: string };

export type EditableLead = {
  id: string;
  estimatedValue: { toString(): string } | null;
  source: string | null;
  campaign: string | null;
  nextFollowUpAt: Date | string | null;
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    leadChannel: string | null;
    serviceRequested: string | null;
  };
  owner: { id: string; name: string | null } | null;
};

function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return "";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * LD-002 — Editar prospecto (Client) + deal (Opportunity).
 */
export function EditLeadButton({
  lead,
  members,
  canEdit,
}: {
  lead: EditableLead;
  members: MemberOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(lead.client.firstName);
  const [lastName, setLastName] = useState(lead.client.lastName ?? "");
  const [email, setEmail] = useState(lead.client.email ?? "");
  const [phone, setPhone] = useState(lead.client.phone ?? "");
  const [source, setSource] = useState(
    lead.client.source ?? lead.source ?? "",
  );
  const [leadChannel, setLeadChannel] = useState(
    lead.client.leadChannel ?? "",
  );
  const [serviceRequested, setServiceRequested] = useState(
    lead.client.serviceRequested ?? "",
  );
  const [ownerId, setOwnerId] = useState(
    lead.owner?.id ?? members[0]?.id ?? "",
  );
  const [estimatedValue, setEstimatedValue] = useState(
    lead.estimatedValue?.toString() ?? "",
  );
  const [campaign, setCampaign] = useState(lead.campaign ?? "");
  const [nextFollowUpAt, setNextFollowUpAt] = useState(
    toDateInputValue(lead.nextFollowUpAt),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setFirstName(lead.client.firstName);
    setLastName(lead.client.lastName ?? "");
    setEmail(lead.client.email ?? "");
    setPhone(lead.client.phone ?? "");
    setSource(lead.client.source ?? lead.source ?? "");
    setLeadChannel(lead.client.leadChannel ?? "");
    setServiceRequested(lead.client.serviceRequested ?? "");
    setOwnerId(lead.owner?.id ?? members[0]?.id ?? "");
    setEstimatedValue(lead.estimatedValue?.toString() ?? "");
    setCampaign(lead.campaign ?? "");
    setNextFollowUpAt(toDateInputValue(lead.nextFollowUpAt));
    setError(null);
  }, [open, lead, members]);

  if (!canEdit) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateLeadAction({
        opportunityId: lead.id,
        firstName,
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
        source: source.trim() || null,
        leadChannel: leadChannel || null,
        serviceRequested: serviceRequested.trim() || null,
        ownerId: ownerId || null,
        estimatedValue: estimatedValue.trim() || null,
        campaign: campaign.trim() || null,
        nextFollowUpAt: nextFollowUpAt || null,
      });
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
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1 px-2 text-xs"
        onClick={() => setOpen(true)}
        aria-label="Editar lead"
      >
        <Pencil className="size-3.5" aria-hidden />
        Editar
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar lead"
        description="Actualiza la persona y el deal. El historial se conserva; no se elimina la oportunidad."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor={`edit-lead-first-${lead.id}`} required>
              <Input
                id={`edit-lead-first-${lead.id}`}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={100}
              />
            </Field>
            <Field label="Apellido" htmlFor={`edit-lead-last-${lead.id}`}>
              <Input
                id={`edit-lead-last-${lead.id}`}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={100}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correo" htmlFor={`edit-lead-email-${lead.id}`}>
              <Input
                id={`edit-lead-email-${lead.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
              />
            </Field>
            <Field label="Teléfono" htmlFor={`edit-lead-phone-${lead.id}`}>
              <Input
                id={`edit-lead-phone-${lead.id}`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Canal" htmlFor={`edit-lead-channel-${lead.id}`}>
              <Select
                id={`edit-lead-channel-${lead.id}`}
                value={leadChannel}
                onChange={(e) => setLeadChannel(e.target.value)}
              >
                <option value="">—</option>
                {Object.entries(LEAD_CHANNEL_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fuente" htmlFor={`edit-lead-source-${lead.id}`}>
              <Input
                id={`edit-lead-source-${lead.id}`}
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={150}
              />
            </Field>
          </div>
          <Field label="Servicio de interés" htmlFor={`edit-lead-service-${lead.id}`}>
            <Input
              id={`edit-lead-service-${lead.id}`}
              value={serviceRequested}
              onChange={(e) => setServiceRequested(e.target.value)}
              maxLength={150}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Responsable" htmlFor={`edit-lead-owner-${lead.id}`}>
              <Select
                id={`edit-lead-owner-${lead.id}`}
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Seguimiento" htmlFor={`edit-lead-followup-${lead.id}`}>
              <DateInput
                id={`edit-lead-followup-${lead.id}`}
                value={nextFollowUpAt}
                onChange={(e) => setNextFollowUpAt(e.target.value)}
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor estimado (USD)" htmlFor={`edit-lead-value-${lead.id}`}>
              <Input
                id={`edit-lead-value-${lead.id}`}
                type="number"
                min="0"
                step="0.01"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
              />
            </Field>
            <Field label="Campaña" htmlFor={`edit-lead-campaign-${lead.id}`}>
              <Input
                id={`edit-lead-campaign-${lead.id}`}
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                maxLength={150}
              />
            </Field>
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
            <Button type="submit" disabled={pending || !firstName.trim()}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
