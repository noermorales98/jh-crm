"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  Field,
  Input,
  Modal,
  Select,
  Textarea,
} from "@/src/components/ui";
import {
  createDisputeLetterDraft,
  ensureLetterTemplates,
  previewDisputeLetter,
} from "@/src/actions/letters";
import { playActionResult } from "@/src/lib/cuelume";
import { CREDIT_BUREAU_LABELS } from "@/src/lib/labels";

type TemplateOption = { id: string; name: string; bureau: string | null };
type DisputeOption = {
  id: string;
  bureau: string;
  creditorName: string;
  disputeReason: string;
};

export function CreateLetterButton({
  roundId,
  templates: initialTemplates,
  disputes,
}: {
  roundId: string;
  templates: TemplateOption[];
  disputes: DisputeOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [templates] = useState(initialTemplates);
  const [bureau, setBureau] = useState<"EXPERIAN" | "EQUIFAX" | "TRANSUNION">(
    "EXPERIAN",
  );
  const [templateId, setTemplateId] = useState(initialTemplates[0]?.id ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [subject, setSubject] = useState("");
  const [content, setContent] = useState("");
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const ensured = await ensureLetterTemplates();
      if (ensured.ok && templates.length === 0) {
        router.refresh();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const bureauItems = disputes.filter((d) => d.bureau === bureau);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handlePreview() {
    setError(null);
    startTransition(async () => {
      const result = await previewDisputeLetter({
        roundId,
        bureau,
        templateId,
        disputeItemIds: [...selected],
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      setSubject(result.data.subject);
      setContent(result.data.content);
      setRecipient(result.data.recipient);
      playActionResult(true);
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await createDisputeLetterDraft({
        roundId,
        bureau,
        templateId,
        disputeItemIds: [...selected],
        ...(subject.trim() ? { subject: subject.trim() } : {}),
        ...(content.trim() ? { content } : {}),
        ...(recipient.trim() ? { recipient: recipient.trim() } : {}),
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
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Generar carta
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Generar carta de disputa"
        description="La carta queda en revisión humana. No se marca como final ni enviada automáticamente."
      >
        <form onSubmit={handleSave} className="space-y-4">
          {error ? <Alert tone="error">{error}</Alert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Buró" htmlFor="ltr-bureau">
              <Select
                id="ltr-bureau"
                value={bureau}
                onChange={(e) => {
                  setBureau(e.target.value as typeof bureau);
                  setSelected(new Set());
                }}
              >
                {Object.entries(CREDIT_BUREAU_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Plantilla" htmlFor="ltr-tpl">
              <Select
                id="ltr-tpl"
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                required
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-control border border-border-subtle p-2">
            {bureauItems.length === 0 ? (
              <p className="text-sm text-text-secondary">
                No hay elementos disputados para este buró.
              </p>
            ) : (
              bureauItems.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer gap-2 rounded-control px-2 py-1.5 text-sm hover:bg-surface-panel"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 rounded border-border-subtle text-action-primary"
                    checked={selected.has(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span>
                    <span className="font-medium">{item.creditorName}</span>
                    <span className="block text-xs text-text-secondary">
                      {item.disputeReason}
                    </span>
                  </span>
                </label>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handlePreview}
              disabled={pending || selected.size === 0 || !templateId}
            >
              Vista previa
            </Button>
          </div>
          <Field label="Destinatario" htmlFor="ltr-to">
            <Input
              id="ltr-to"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </Field>
          <Field label="Asunto" htmlFor="ltr-subject">
            <Input
              id="ltr-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </Field>
          <Field label="Contenido (editable)" htmlFor="ltr-body">
            <Textarea
              id="ltr-body"
              rows={10}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={pending || selected.size === 0 || !content.trim()}
            >
              {pending ? "Guardando…" : "Guardar para revisión"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
