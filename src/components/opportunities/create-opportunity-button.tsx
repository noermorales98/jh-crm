"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
} from "@/src/components/ui";
import { createOpportunityAction } from "@/src/actions/opportunities";
import { playActionResult } from "@/src/lib/cuelume";

type ClientOption = {
  id: string;
  label: string;
};

export function CreateOpportunityButton({
  clients,
  defaultClientId,
}: {
  clients: ClientOption[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState(defaultClientId ?? clients[0]?.id ?? "");
  const [estimatedValue, setEstimatedValue] = useState("");
  const [source, setSource] = useState("");
  const [campaign, setCampaign] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (clients.length === 0) {
    return (
      <Button size="sm" disabled title="Necesitas al menos un cliente LEAD o activo">
        <Plus className="size-4" aria-hidden />
        Nueva oportunidad
      </Button>
    );
  }

  function openModal() {
    setClientId(defaultClientId ?? clients[0]?.id ?? "");
    setEstimatedValue("");
    setSource("");
    setCampaign("");
    setError(null);
    setOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createOpportunityAction({
        clientId,
        estimatedValue: estimatedValue.trim() || null,
        source: source.trim() || null,
        campaign: campaign.trim() || null,
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
      <Button size="sm" onClick={openModal}>
        <Plus className="size-4" aria-hidden />
        Nueva oportunidad
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva oportunidad"
        description="Pipeline comercial separado del flujo operativo del caso."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Cliente" htmlFor="opp-client" required>
            <Select
              id="opp-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Valor estimado (USD)" htmlFor="opp-value">
            <Input
              id="opp-value"
              type="number"
              min="0"
              step="0.01"
              value={estimatedValue}
              onChange={(e) => setEstimatedValue(e.target.value)}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fuente" htmlFor="opp-source">
              <Input
                id="opp-source"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                maxLength={150}
              />
            </Field>
            <Field label="Campaña" htmlFor="opp-campaign">
              <Input
                id="opp-campaign"
                value={campaign}
                onChange={(e) => setCampaign(e.target.value)}
                maxLength={150}
              />
            </Field>
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
              {pending ? "Creando…" : "Crear oportunidad"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
