"use client";

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Overlay de picker sin <dialog> anidado.
 * Si hay un modal abierto, se porta dentro de ese dialog (mismo top layer);
 * si no, a document.body. Así Cancelar/Confirmar no cierran el modal padre.
 */
export function PickerDialog({
  open,
  onClose,
  labelledBy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const handleClose = useEffectEvent(() => {
    onClose();
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setHost(null);
      return;
    }

    const parentDialog = document.querySelector<HTMLElement>(
      "dialog[open]:not([data-jh-picker])",
    );
    setHost(parentDialog ?? document.body);

    const previousOverflow = document.body.style.overflow;
    if (!parentDialog) {
      document.body.style.overflow = "hidden";
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        handleClose();
      }
    }

    window.addEventListener("keydown", onKeyDown, true);

    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!mounted || !open || !host) return null;

  return createPortal(
    <div
      data-jh-picker=""
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        className="jh-overlay-shadow flex max-h-[min(32rem,85dvh)] w-full max-w-md flex-col overflow-hidden rounded-[20px] border border-border-subtle bg-surface-elevated"
        onClick={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    host,
  );
}
