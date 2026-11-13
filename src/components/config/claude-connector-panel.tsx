"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Copy } from "lucide-react";
import { Alert, Button, ConfirmDialog, Pill } from "@/src/components/ui";
import { revokeMcpConnectionAction, setMcpEnabledAction } from "@/src/actions/mcp-connections";

export interface ConnectionView {
  id: string;
  clientName: string;
  userLabel: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: "activa" | "cortada";
}

export function CopyConnectorUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setFailed(false);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <code className="min-w-0 flex-1 break-all rounded-control bg-surface-panel px-3 py-2 text-sm text-ink">{url}</code>
        <Button variant="secondary" onClick={copy} className="shrink-0" aria-label="Copiar la dirección del conector">
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Copiada" : "Copiar"}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="sr-only">
        {copied ? "Dirección copiada." : ""}
      </p>
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          No se pudo copiar. Selecciona la dirección y cópiala a mano.
        </p>
      ) : null}
    </div>
  );
}

export function ConnectorSwitch({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function toggle() {
    setError(null);
    start(async () => {
      const r = await setMcpEnabledAction(!enabled);
      if (!r.ok) setError(r.error);
    });
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-secondary">
          {enabled
            ? "Encendido: el equipo puede conectar Claude con su usuario."
            : "Apagado: nadie de la organización puede usar Claude con el CRM."}
        </p>
        {enabled ? (
          <ConfirmDialog
            title="Apagar el conector de Claude"
            message="Nadie de la organización podrá usar Claude con el CRM hasta que lo vuelvas a encender. Las conexiones no se borran: vuelven a funcionar al encenderlo."
            confirmLabel="Apagar"
            danger
            onConfirm={async () => {
              const r = await setMcpEnabledAction(false);
              return r.ok ? undefined : r.error;
            }}
            trigger={
              <Button variant="secondary" disabled={pending} className="shrink-0">
                Apagar conector
              </Button>
            }
          />
        ) : (
          <Button variant="primary" onClick={toggle} disabled={pending} className="shrink-0">
            {pending ? "Guardando…" : "Encender conector"}
          </Button>
        )}
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </div>
  );
}

export function ConnectionList({
  items,
  showUser,
  emptyText,
  connectorEnabled,
}: {
  items: ConnectionView[];
  showUser: boolean;
  emptyText: string;
  connectorEnabled: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-control bg-surface-panel px-4 py-6 text-center text-sm text-text-secondary">{emptyText}</p>
    );
  }
  return (
    <ul className="divide-y divide-border-subtle">
      {items.map((c) => (
        <li key={c.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-ink">{c.clientName}</span>
              <Pill tone={c.status === "activa" ? "green" : "amber"}>
                {c.status === "activa" ? "Activa" : "Cortada"}
              </Pill>
            </div>
            {showUser ? <p className="break-all text-sm text-text-secondary">{c.userLabel}</p> : null}
            <p className="text-xs text-text-secondary">
              Conectada el {c.createdAt}
              {c.lastUsedAt ? ` · último uso ${c.lastUsedAt}` : " · sin uso todavía"}
            </p>
            {c.status === "cortada" ? (
              <p className="text-xs text-text-secondary">
                {connectorEnabled
                  ? "Se cortó por un cambio de rol o de correo, o porque la cuenta se desactivó. Vuelve a conectar desde Claude."
                  : "El conector está apagado. Volverá a funcionar sola cuando un administrador lo encienda."}
              </p>
            ) : null}
          </div>
          <ConfirmDialog
            title="Cortar el acceso de Claude"
            message="Claude dejará de poder usar el CRM con esta conexión. Para volver a usarlo habrá que conectar de nuevo."
            confirmLabel="Cortar acceso"
            danger
            onConfirm={async () => {
              const r = await revokeMcpConnectionAction(c.id);
              return r.ok ? undefined : r.error;
            }}
            trigger={
              <Button
                variant="danger"
                size="sm"
                className="shrink-0"
                aria-label={showUser ? `Cortar acceso de ${c.clientName} para ${c.userLabel}` : `Cortar acceso de ${c.clientName}`}
              >
                Cortar acceso
              </Button>
            }
          />
        </li>
      ))}
    </ul>
  );
}
