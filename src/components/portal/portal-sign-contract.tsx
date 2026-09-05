"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Field, Input } from "@/src/components/ui";
import { signPortalContractAction } from "@/src/actions/portal";
import { playActionResult } from "@/src/lib/cuelume";

/** Firma simple: nombre + trazo en canvas como data URL PNG. */
export function PortalSignContractButton({
  contractId,
  title,
  defaultName,
}: {
  contractId: string;
  title: string;
  defaultName?: string;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [open, setOpen] = useState(false);
  const [signerName, setSignerName] = useState(defaultName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [pending, startTransition] = useTransition();

  function getCtx() {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const blank = document.createElement("canvas");
    blank.width = canvas.width;
    blank.height = canvas.height;
    if (canvas.toDataURL() === blank.toDataURL()) {
      setError("Dibuja tu firma antes de continuar.");
      return;
    }

    const signatureData = canvas.toDataURL("image/png");
    startTransition(async () => {
      const result = await signPortalContractAction({
        contractId,
        signerName,
        signatureData,
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

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        Firmar
      </Button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-3 rounded-surface border border-border-subtle bg-surface-app p-3"
    >
      <p className="text-sm font-medium text-ink">Firmar: {title}</p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field label="Nombre completo" htmlFor={`signer-${contractId}`} required>
        <Input
          id={`signer-${contractId}`}
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          required
        />
      </Field>
      <div>
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-secondary">
          Firma
        </p>
        <canvas
          ref={canvasRef}
          width={400}
          height={140}
          className="w-full touch-none rounded-control border border-border-subtle bg-white"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrawing(true);
            const ctx = getCtx();
            if (!ctx) return;
            const { x, y } = pointerPos(e);
            ctx.strokeStyle = "#111";
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(x, y);
          }}
          onPointerMove={(e) => {
            if (!drawing) return;
            const ctx = getCtx();
            if (!ctx) return;
            const { x, y } = pointerPos(e);
            ctx.lineTo(x, y);
            ctx.stroke();
          }}
          onPointerUp={() => setDrawing(false)}
          onPointerLeave={() => setDrawing(false)}
        />
        <button
          type="button"
          className="mt-1 text-xs text-action-primary hover:underline"
          onClick={clearCanvas}
        >
          Borrar firma
        </button>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Firmando…" : "Confirmar firma"}
        </Button>
      </div>
    </form>
  );
}
