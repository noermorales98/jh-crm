"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, Share2 } from "lucide-react";
import { Alert, Button } from "@/src/components/ui";

/**
 * Link de Checkout Stripe listo: nombre legible + Ver / Compartir / Copiar.
 * No muestra la URL cruda (el staff no necesita leer checkout.stripe.com/…).
 */
export function StripeCheckoutLinkBar({
  url,
  label = "Pago Stripe",
  onClear,
}: {
  url: string;
  /** Nombre para identificar el link (p. ej. folio de cotización). */
  label?: string;
  onClear?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function copy() {
    setActionError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setActionError("No se pudo copiar el link. Intenta de nuevo.");
    }
  }

  async function share() {
    setActionError(null);
    const title = label;
    const text = `Link de pago: ${label}`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text, url });
        setShared(true);
        window.setTimeout(() => setShared(false), 2000);
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch (err) {
      // Usuario canceló el share nativo: no es error.
      if (err instanceof DOMException && err.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setShared(true);
        window.setTimeout(() => setShared(false), 2000);
      } catch {
        setActionError("No se pudo compartir. Usa Copiar.");
      }
    }
  }

  function view() {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-2 rounded-control bg-surface-elevated p-3 ring-1 ring-border-subtle/60">
      <div className="min-w-0">
        <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
          Link de pago listo
        </p>
        <p className="truncate text-sm font-medium text-ink" title={label}>
          {label}
        </p>
      </div>
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={view}
          aria-label={`Ver ${label}`}
        >
          <ExternalLink className="size-3.5" aria-hidden /> Ver
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => void share()}
          aria-label={`Compartir ${label}`}
        >
          {shared ? (
            <>
              <Check className="size-3.5" aria-hidden /> Listo
            </>
          ) : (
            <>
              <Share2 className="size-3.5" aria-hidden /> Compartir
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => void copy()}
          aria-label={`Copiar link de ${label}`}
        >
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden /> Copiar
            </>
          )}
        </Button>
        {onClear ? (
          <Button type="button" size="sm" variant="ghost" onClick={onClear}>
            Cerrar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
