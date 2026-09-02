"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input, Select, Textarea } from "@/src/components/ui";
import { saveDraft, sendMail } from "@/src/actions/mails";
import { playActionResult } from "@/src/lib/cuelume";

export function ComposeMailForm({
  clients,
  smtpConfigured,
  initial,
}: {
  clients: { id: string; label: string; email: string | null }[];
  smtpConfigured: boolean;
  initial?: {
    draftId?: string;
    inReplyToId?: string;
    to?: string;
    cc?: string;
    subject?: string;
    body?: string;
    clientId?: string | null;
  };
}) {
  const router = useRouter();
  const [to, setTo] = useState(initial?.to ?? "");
  const [cc, setCc] = useState(initial?.cc ?? "");
  const [subject, setSubject] = useState(initial?.subject ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [clientId, setClientId] = useState(initial?.clientId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function payload() {
    return {
      to,
      cc,
      subject,
      body,
      ...(clientId ? { clientId } : {}),
      ...(initial?.draftId ? { draftId: initial.draftId } : {}),
      ...(initial?.inReplyToId ? { inReplyToId: initial.inReplyToId } : {}),
    };
  }

  function handleClientChange(id: string) {
    setClientId(id);
    const client = clients.find((c) => c.id === id);
    if (client?.email && !to.trim()) setTo(client.email);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        startTransition(async () => {
          const result = await sendMail(payload());
          playActionResult(result.ok);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push(`/crm/mails/${result.data.id}?folder=sent`);
          router.refresh();
        });
      }}
    >
      {smtpConfigured ? null : (
        <Alert tone="error">
          Configura SMTP en Configuración → Notificaciones antes de enviar.
        </Alert>
      )}
      {error ? <Alert tone="error">{error}</Alert> : null}

      <Field label="Para" htmlFor="mail-to" required>
        <Input
          id="mail-to"
          type="text"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          required
          placeholder="cliente@correo.com"
          autoComplete="off"
        />
      </Field>
      <Field label="CC" htmlFor="mail-cc" hint="Opcional. Separa varios correos con coma.">
        <Input
          id="mail-cc"
          type="text"
          value={cc}
          onChange={(e) => setCc(e.target.value)}
          placeholder="copia@correo.com"
          autoComplete="off"
        />
      </Field>
      <Field label="Cliente (opcional)" htmlFor="mail-client">
        <Select
          id="mail-client"
          value={clientId}
          onChange={(e) => handleClientChange(e.target.value)}
        >
          <option value="">Sin cliente</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Asunto" htmlFor="mail-subject" required>
        <Input
          id="mail-subject"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
          maxLength={500}
        />
      </Field>
      <Field label="Mensaje" htmlFor="mail-body" required>
        <Textarea
          id="mail-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          required
          rows={14}
          maxLength={50_000}
        />
      </Field>

      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await saveDraft(payload());
              playActionResult(result.ok);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              router.push(`/crm/mails/${result.data.id}?folder=drafts`);
              router.refresh();
            });
          }}
        >
          {pending ? "Guardando…" : "Guardar borrador"}
        </Button>
        <Button type="submit" disabled={pending || !smtpConfigured}>
          {pending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </form>
  );
}
