"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Alert, Button } from "@/src/components/ui";

/**
 * Muestra un Checkout URL de Stripe: copiar / abrir en pestaña nueva
 * (el staff no pierde el CRM).
 */
export function StripeCheckoutLinkBar({
  url,
  onClear,
}: {
  url: string;
  onClear?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copy() {
    setCopyError(null);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  return (
    <div className="space-y-2 rounded-control bg-surface-elevated p-3 ring-1 ring-border-subtle/60">
      <p className="text-xs font-medium text-ink">Link de pago Stripe listo</p>
      <p className="break-all font-mono text-[11px] text-text-secondary">{url}</p>
      {copyError ? <Alert tone="error">{copyError}</Alert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void copy()}>
          {copied ? (
            <>
              <Check className="size-3.5" aria-hidden /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-3.5" aria-hidden /> Copiar link
            </>
          )}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
        >
          <ExternalLink className="size-3.5" aria-hidden /> Abrir Checkout
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
