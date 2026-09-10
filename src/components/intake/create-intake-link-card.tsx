"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Link2, Loader2 } from "lucide-react";
import { Alert, Button, Field, Select } from "@/src/components/ui";
import { createIntakeLink, revokeIntakeLink } from "@/src/actions/intake";
import { playActionResult } from "@/src/lib/cuelume";
import { formatDate } from "@/src/lib/format";

type ExistingLink = {
  id: string;
  url: string;
  caseCode: string | null;
  maxUses: number;
  useCount: number;
  expiresAt: Date | string | null;
  usable: boolean;
  isActive: boolean;
};

/**
 * Genera y gestiona enlaces públicos /intake/[token] para el cliente.
 */
export function CreateIntakeLinkCard({
  clientId,
  cases = [],
  existingLinks = [],
  compact = false,
}: {
  clientId: string;
  cases?: { id: string; caseCode: string }[];
  existingLinks?: ExistingLink[];
  /** Layout denso para columnas laterales (ficha cliente). */
  compact?: boolean;
}) {
  const router = useRouter();
  const [caseId, setCaseId] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function create() {
    setError(null);
    startTransition(async () => {
      const result = await createIntakeLink({
        clientId,
        caseId: caseId || null,
        maxUses: Number(maxUses),
        expiresInDays: Number(expiresInDays),
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        setUrl(null);
        return;
      }
      playActionResult(true);
      setUrl(result.data.url);
      setExpiresAt(result.data.expiresAt);
      router.refresh();
    });
  }

  async function copyText(value: string, id: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setError("No se pudo copiar. Selecciona el enlace y cópialo a mano.");
    }
  }

  function revoke(linkId: string) {
    setError(null);
    startTransition(async () => {
      const result = await revokeIntakeLink(linkId, clientId);
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      router.refresh();
    });
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      {error ? <Alert tone="error">{error}</Alert> : null}

      <div
        className={
          compact ? "grid gap-2" : "grid gap-3 sm:grid-cols-3"
        }
      >
        <Field label="Caso (opcional)" htmlFor="intake-case">
          <Select
            id="intake-case"
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            disabled={pending}
          >
            <option value="">Sin caso</option>
            {cases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.caseCode}
              </option>
            ))}
          </Select>
        </Field>
        <div className={compact ? "grid grid-cols-2 gap-2" : "contents"}>
          <Field label="Usos máximos" htmlFor="intake-uses">
            <Select
              id="intake-uses"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
              disabled={pending}
            >
              <option value="1">1 uso</option>
              <option value="3">3 usos</option>
              <option value="5">5 usos</option>
            </Select>
          </Field>
          <Field label="Caduca en" htmlFor="intake-expires">
            <Select
              id="intake-expires"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              disabled={pending}
            >
              <option value="1">1 día</option>
              <option value="7">7 días</option>
              <option value="30">30 días</option>
            </Select>
          </Field>
        </div>
      </div>

      <Button
        type="button"
        variant="primary"
        size="sm"
        className={compact ? "w-full border border-transparent shadow-sm" : ""}
        onClick={create}
        disabled={pending}
      >
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Generando…
          </>
        ) : (
          <>
            <Link2 className="size-4" aria-hidden />
            Generar enlace
          </>
        )}
      </Button>

      {url ? (
        <div
          className={
            compact
              ? "space-y-1.5 rounded-control bg-surface-app px-2 py-2"
              : "space-y-2 rounded-control bg-surface-app px-3 py-3"
          }
        >
          <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
            Enlace nuevo
            {expiresAt ? ` · caduca ${formatDate(expiresAt)}` : ""}
          </p>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="min-w-0 flex-1 truncate rounded-control border border-border-subtle bg-surface-elevated px-2 py-1.5 text-xs text-ink"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void copyText(url, "new")}
              aria-label="Copiar enlace"
            >
              {copied === "new" ? (
                <Check className="size-4 text-success-ink" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
            </Button>
          </div>
        </div>
      ) : null}

      {existingLinks.length > 0 ? (
        <div className={compact ? "space-y-1" : "space-y-2"}>
          {!compact ? (
            <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
              Enlaces recientes
            </p>
          ) : null}
          <ul
            className={
              compact
                ? "max-h-28 space-y-1 overflow-y-auto"
                : "divide-y divide-border-subtle rounded-control border border-border-subtle"
            }
          >
            {existingLinks.slice(0, compact ? 3 : undefined).map((link) => (
              <li
                key={link.id}
                className={
                  compact
                    ? "flex items-center justify-between gap-1 rounded-control border border-border-subtle px-2 py-1"
                    : "flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                }
              >
                <div className="min-w-0">
                  {!compact ? (
                    <p className="truncate text-sm text-ink" title={link.url}>
                      {link.url}
                    </p>
                  ) : null}
                  <p className="truncate text-[11px] text-text-secondary">
                    {link.usable ? "Activo" : link.isActive ? "Agotado" : "Revocado"}
                    {" · "}
                    {link.useCount}/{link.maxUses}
                    {link.caseCode ? ` · ${link.caseCode}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyText(link.url, link.id)}
                    aria-label="Copiar"
                  >
                    {copied === link.id ? (
                      <Check className="size-3.5 text-success-ink" aria-hidden />
                    ) : (
                      <Copy className="size-3.5" aria-hidden />
                    )}
                  </Button>
                  {link.isActive ? (
                    <Button
                      type="button"
                      variant="danger"
                      size="sm"
                      disabled={pending}
                      onClick={() => revoke(link.id)}
                    >
                      {compact ? "×" : "Revocar"}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
