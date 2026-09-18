"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UserPlus } from "lucide-react";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Input,
  Modal,
  Select,
} from "@/src/components/ui";
import { createLeadAction } from "@/src/actions/opportunities";
import { playActionResult } from "@/src/lib/cuelume";
import { LEAD_CHANNEL_LABELS } from "@/src/lib/labels";

type MemberOption = { id: string; name: string };

/**
 * LD-001 — Alta de prospecto: Client LEAD + Opportunity.
 */
export function CreateLeadButton({
  members,
  canCreate,
}: {
  members: MemberOption[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [source, setSource] = useState("");
  const [leadChannel, setLeadChannel] = useState("");
  const [serviceRequested, setServiceRequested] = useState("");
  const [ownerId, setOwnerId] = useState(members[0]?.id ?? "");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [campaign, setCampaign] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canCreate) return null;

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setSource("");
    setLeadChannel("");
    setServiceRequested("");
    setOwnerId(members[0]?.id ?? "");
    setEstimatedValue("");
    setCampaign("");
    setNextFollowUpAt("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createLeadAction({
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
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <UserPlus className="size-4" aria-hidden />
        Nuevo lead
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo lead"
        description="Crea la persona (prospecto) y el deal comercial juntos. No se crea una tabla Lead separada."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" htmlFor="lead-first" required>
              <Input
                id="lead-first"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
                maxLength={100}
                autoComplete="given-name"
              />
            </Field>
            <Field label="Apellido" htmlFor="lead-last">
              <Input
                id="lead-last"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                maxLength={100}
                autoComplete="family-name"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Correo" htmlFor="lead-email">
              <Input
                id="lead-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                maxLength={200}
                autoComplete="email"
              />
            </Field>
            <Field label="Teléfono" htmlFor="lead-phone">
              <Input
                id="lead-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={40}
                autoComplete="tel"
              />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Canal" htmlFor="lead-channel">
              <Select
                id="lead-channel"
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
            <Field label="Fuente" htmlFor="lead-source">
              <Input
                id="lead-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={150}
                placeholder="Instagram, referido…"
              />
            </Field>
          </div>
          <Field label="Servicio de interés" htmlFor="lead-service">
            <Input
              id="lead-service"
              value={serviceRequested}
              onChange={(e) => setServiceRequested(e.target.value)}
              maxLength={150}
              placeholder="Credit Repair, Home Buyer…"
            />
          </Field>
          <Field label="Seguimiento" htmlFor="lead-followup">
            <DateInput
              id="lead-followup"
              value={nextFollowUpAt}
              onChange={(e) => setNextFollowUpAt(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Valor estimado (USD)" htmlFor="lead-value">
              <Input
                id="lead-value"
                type="number"
                min="0"
                step="0.01"
                value={estimatedValue}
                onChange={(e) => setEstimatedValue(e.target.value)}
              />
            </Field>
            <Field label="Campaña" htmlFor="lead-campaign">
              <Input
                id="lead-campaign"
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
              {pending ? "Creando…" : "Crear lead"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
