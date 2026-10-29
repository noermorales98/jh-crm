"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, Copy, Download, ExternalLink, QrCode } from "lucide-react";
import { Button, Field, Input, Modal } from "@/src/components/ui";
import type { CaptureOverview } from "@/src/server/marketing/capture";
import {
  CAPTURE_CHANNELS,
  buildCaptureUrl,
  captureChannelLabel,
  captureQrFileName,
  type CaptureChannel,
} from "@/src/lib/marketing/capture-links";

/**
 * Página de captación: link por canal (con UTM) y su QR para volantes,
 * historias o eventos. Muestra cuántos prospectos llegaron por cada canal.
 */
export function CaptureLinkButton({ overview }: { overview: CaptureOverview }) {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<CaptureChannel | null>("instagram");
  const [campaign, setCampaign] = useState("");
  const [qr, setQr] = useState<{ url: string; dataUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const url = useMemo(
    () => buildCaptureUrl({ baseUrl: overview.baseUrl, channel, campaign }),
    [overview.baseUrl, channel, campaign],
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    QRCode.toDataURL(url, { width: 640, margin: 2, color: { dark: "#1d1d1f", light: "#ffffff" } })
      .then((dataUrl) => {
        if (!cancelled) setQr({ url, dataUrl });
      })
      .catch(() => {
        if (!cancelled) setQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  const qrReady = qr?.url === url ? qr.dataUrl : null;
  const options: { key: CaptureChannel | null; label: string }[] = [
    ...CAPTURE_CHANNELS.map((c) => ({ key: c.key, label: c.label })),
    { key: null, label: "Sin canal" },
  ];

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <QrCode className="size-4" aria-hidden />
        Página de captación
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Página de captación" size="xl">
        <div className="space-y-7">
          <p className="text-[13px] text-text-secondary">
            Comparte este link o su QR. Cada persona que deje sus datos entra a Leads como prospecto nuevo, con el
            canal de donde vino.
          </p>

          <section className="space-y-3">
            <h3 className="text-[14px] font-semibold text-ink">¿Dónde lo vas a compartir?</h3>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Canal">
              {options.map((opt) => {
                const active = opt.key === channel;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setChannel(opt.key)}
                    className={
                      active
                        ? "rounded-full bg-ink px-3 py-1.5 text-[13px] font-medium text-surface-app"
                        : "rounded-full bg-nav-hover/70 px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-nav-hover"
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <Field
              label="Campaña (opcional)"
              htmlFor="capture-campaign"
              hint="Para distinguir, por ejemplo, la feria de mayo de los volantes de la tienda."
            >
              <Input
                id="capture-campaign"
                value={campaign}
                maxLength={60}
                onChange={(e) => setCampaign(e.target.value)}
                placeholder="Feria de mayo"
              />
            </Field>
          </section>

          <section className="grid gap-5 sm:grid-cols-[1fr_11rem] sm:items-start">
            <div className="min-w-0 space-y-3">
              <h3 className="text-[14px] font-semibold text-ink">Tu link</h3>
              <p className="break-all rounded-control bg-surface-app px-3 py-2.5 font-mono text-[12.5px] text-ink">
                {url}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="primary" onClick={copy}>
                  {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {copied ? "Copiado" : "Copiar link"}
                </Button>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-control px-3 text-[13px] font-medium text-ink hover:bg-nav-hover"
                >
                  Ver página
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>
            </div>
            <div className="space-y-2">
              <div className="grid aspect-square w-full max-w-44 place-items-center rounded-control bg-[#ffffff] p-1">
                {qrReady ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URL del QR
                  <img src={qrReady} alt="Código QR del link" className="size-full" />
                ) : (
                  <div className="size-full animate-pulse rounded bg-nav-hover/60" aria-hidden />
                )}
              </div>
              {qrReady ? (
                <a
                  href={qrReady}
                  download={captureQrFileName(channel, campaign)}
                  className="inline-flex items-center gap-1.5 text-[13px] font-medium text-action-primary hover:underline"
                >
                  <Download className="size-3.5" aria-hidden />
                  Descargar QR
                </a>
              ) : null}
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="text-[14px] font-semibold text-ink">Últimos {overview.days} días</h3>
            {overview.total === 0 ? (
              <p className="text-[13px] text-text-secondary">
                Aún no llegan prospectos por esta página. Aquí verás cuántos llegan por cada canal.
              </p>
            ) : (
              <>
                <p className="text-[13px] text-text-secondary">
                  {overview.total} {overview.total === 1 ? "prospecto" : "prospectos"}, {overview.converted}{" "}
                  {overview.converted === 1 ? "ya es cliente" : "ya son clientes"}.
                </p>
                <ul className="divide-y divide-border-subtle/50">
                  {overview.byChannel.map((row) => (
                    <li key={row.source || "none"} className="flex items-center justify-between py-2 text-[13px]">
                      <span className="font-medium text-ink">{captureChannelLabel(row.source)}</span>
                      <span className="tabular-nums text-text-secondary">
                        {row.leads} {row.leads === 1 ? "prospecto" : "prospectos"} · {row.clients}{" "}
                        {row.clients === 1 ? "cliente" : "clientes"}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
}
