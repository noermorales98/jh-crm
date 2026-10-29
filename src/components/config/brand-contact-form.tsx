"use client";

import { useRef, useState, useTransition, type PointerEvent } from "react";
import { Check, ExternalLink, Eraser, Upload } from "lucide-react";
import { Button, Field, Input } from "@/src/components/ui";
import { updateBrandContactAction } from "@/src/actions/brand-contact";
import type { BrandContact } from "@/src/server/config/brand-contact";
import {
  SIGNATURE_MAX_CHARS,
  normalizeBookingUrl,
  whatsappLink,
} from "@/src/lib/brand/contact-links";
import { playActionResult } from "@/src/lib/cuelume";

const PAD_W = 600;
const PAD_H = 180;

/** Lienzo para dibujar la firma con el dedo o el mouse. */
function SignaturePad({ onDone }: { onDone: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [dirty, setDirty] = useState(false);

  function pos(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function start(event: PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    const p = pos(event);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1c1c1e";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  function move(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pos(event);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setDirty(true);
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(false);
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={PAD_W}
        height={PAD_H}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Dibuja tu firma"
        className="h-36 w-full touch-none rounded-control bg-[#ffffff] ring-1 ring-border-subtle"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={clear} disabled={!dirty}>
          <Eraser className="size-3.5" aria-hidden />
          Borrar trazo
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!dirty}
          onClick={() => onDone(canvasRef.current?.toDataURL("image/png") ?? null)}
        >
          <Check className="size-3.5" aria-hidden />
          Usar esta firma
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDone(null)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Contacto para clientes (WhatsApp y agenda) y firma del representante que
 * se estampa en cada contrato al enviarlo a firmar.
 */
export function BrandContactForm({ initial }: { initial: BrandContact }) {
  const [whatsapp, setWhatsapp] = useState(initial.whatsappNumber ?? "");
  const [booking, setBooking] = useState(initial.bookingUrl ?? "");
  const [name, setName] = useState(initial.representativeName ?? "");
  const [signature, setSignature] = useState<string | null>(initial.representativeSignature);
  const [drawingOpen, setDrawingOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const waTest = whatsappLink(whatsapp, "Hola, prueba de WhatsApp desde el CRM");
  const bookingTest = normalizeBookingUrl(booking);

  function save(next: Partial<{ signature: string | null }> = {}) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await updateBrandContactAction({
        whatsappNumber: whatsapp.trim() || null,
        bookingUrl: booking.trim() || null,
        representativeName: name.trim() || null,
        representativeSignature: "signature" in next ? next.signature : signature,
      });
      playActionResult(result.ok);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setWhatsapp(result.data.whatsappNumber ?? "");
      setBooking(result.data.bookingUrl ?? "");
      setSignature(result.data.representativeSignature);
      setSaved(true);
    });
  }

  function onFile(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      setError("Sube una imagen PNG o JPG.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl || dataUrl.length > SIGNATURE_MAX_CHARS) {
        setError("La imagen pesa demasiado. Usa una de menos de 200 KB.");
        return;
      }
      setSignature(dataUrl);
      save({ signature: dataUrl });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="WhatsApp del negocio"
          htmlFor="brand-whatsapp"
          hint="Con código de país. Aparece como botón en el portal, correos y cotizaciones."
        >
          <div className="flex gap-2">
            <Input
              id="brand-whatsapp"
              inputMode="tel"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              placeholder="+1 872 202 0156"
            />
            {waTest ? (
              <a
                href={waTest}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-control bg-nav-hover/70 px-3 text-[13px] font-medium text-ink hover:bg-nav-hover"
              >
                Probar
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </Field>
        <Field
          label="Link de agenda"
          htmlFor="brand-booking"
          hint="Calendly, cal.com o tu calendario. Es el botón «Agendar una llamada»."
        >
          <div className="flex gap-2">
            <Input
              id="brand-booking"
              inputMode="url"
              value={booking}
              onChange={(e) => setBooking(e.target.value)}
              placeholder="https://calendly.com/tu-agencia"
            />
            {bookingTest ? (
              <a
                href={bookingTest}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center gap-1 rounded-control bg-nav-hover/70 px-3 text-[13px] font-medium text-ink hover:bg-nav-hover"
              >
                Probar
                <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
          </div>
        </Field>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-[14px] font-semibold text-ink">Firma del representante</h3>
          <p className="mt-0.5 text-[12.5px] text-text-secondary">
            Se estampa sola, con la fecha, en cada contrato que envías a firmar. Los contratos ya enviados no cambian.
          </p>
        </div>
        <Field label="Nombre de quien firma" htmlFor="brand-rep-name">
          <Input
            id="brand-rep-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre y cargo, p. ej. Noé Morales, Director"
          />
        </Field>

        {drawingOpen ? (
          <SignaturePad
            onDone={(dataUrl) => {
              setDrawingOpen(false);
              if (dataUrl) {
                setSignature(dataUrl);
                save({ signature: dataUrl });
              }
            }}
          />
        ) : signature ? (
          <div className="flex flex-wrap items-center gap-4 rounded-control bg-surface-app p-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL de la firma */}
            <img src={signature} alt="Firma guardada" className="h-16 max-w-[240px] rounded bg-[#ffffff] object-contain p-1" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" onClick={() => setDrawingOpen(true)}>
                Cambiar firma
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSignature(null);
                  save({ signature: null });
                }}
              >
                Quitar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => setDrawingOpen(true)}>
              Dibujar firma
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
              <Upload className="size-3.5" aria-hidden />
              Subir imagen
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => onFile(e.target.files?.[0])}
            />
          </div>
        )}
      </div>

      {error ? <p className="text-[13px] text-danger-ink">{error}</p> : null}
      <div className="flex items-center gap-3">
        <Button type="button" variant="primary" disabled={pending} onClick={() => save()}>
          {pending ? "Guardando…" : "Guardar contacto y firma"}
        </Button>
        {saved ? <span className="text-[13px] text-success-ink">Guardado</span> : null}
      </div>
    </div>
  );
}
