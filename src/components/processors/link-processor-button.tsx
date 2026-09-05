"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link2 } from "lucide-react";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import { linkProcessorAccountAction } from "@/src/actions/processors";
import { playActionResult } from "@/src/lib/cuelume";
import {
  labelFor,
  PROCESSOR_ACCOUNT_STATUS_LABELS,
} from "@/src/lib/labels";

type ProcessorOption = { id: string; name: string };

export function LinkProcessorButton({
  clientId,
  processors,
}: {
  clientId: string;
  processors: ProcessorOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [processorId, setProcessorId] = useState(processors[0]?.id ?? "");
  const [externalMemberId, setExternalMemberId] = useState("");
  const [externalUrl, setExternalUrl] = useState("");
  const [status, setStatus] = useState("PLANNED");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (processors.length === 0) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await linkProcessorAccountAction({
        clientId,
        processorId,
        externalMemberId: externalMemberId.trim() || null,
        externalUrl: externalUrl.trim() || null,
        status,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      setOpen(false);
      setExternalMemberId("");
      setExternalUrl("");
      setNotes("");
      router.refresh();
    });
  }

  return (
    <>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Link2 className="size-4" aria-hidden />
        Vincular procesador
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Vincular procesador"
        description="Asocia una cuenta externa al cliente (sin contraseñas)."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <Field label="Procesador" htmlFor="link-proc" required>
            <Select
              id="link-proc"
              value={processorId}
              onChange={(e) => setProcessorId(e.target.value)}
              required
            >
              {processors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ID externo / miembro" htmlFor="link-ext">
            <Input
              id="link-ext"
              value={externalMemberId}
              onChange={(e) => setExternalMemberId(e.target.value)}
              maxLength={200}
            />
          </Field>
          <Field label="URL externa" htmlFor="link-url">
            <Input
              id="link-url"
              value={externalUrl}
              onChange={(e) => setExternalUrl(e.target.value)}
              maxLength={2000}
            />
          </Field>
          <Field label="Estado" htmlFor="link-status">
            <Select
              id="link-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {Object.keys(PROCESSOR_ACCOUNT_STATUS_LABELS).map((key) => (
                <option key={key} value={key}>
                  {labelFor(PROCESSOR_ACCOUNT_STATUS_LABELS, key)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Notas" htmlFor="link-notes">
            <Textarea
              id="link-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
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
              {pending ? "Vinculando…" : "Vincular"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
