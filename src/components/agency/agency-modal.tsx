"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

const SIZE_CLASS = {
  md: "max-w-md",
  lg: "max-w-2xl",
  xl: "max-w-3xl",
} as const;

export function AgencyModal({
  open,
  onClose,
  title,
  children,
  closeOnEscape = false,
  size = "md",
  /** Center body content in a readable column. */
  centerBody = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Fondify: majority ignore Escape; only Comparte closes with Escape. */
  closeOnEscape?: boolean;
  size?: keyof typeof SIZE_CLASS;
  centerBody?: boolean;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !closeOnEscape) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-ink/55 backdrop-blur-[2px]"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-surface bg-surface-panel p-5 shadow-[0_8px_40px_rgba(0,0,0,0.18)] outline-none sm:p-6 ${SIZE_CLASS[size]}`}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <h2
            id={titleId}
            className="text-[17px] font-semibold tracking-[-0.01em] text-ink"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-nav-hover hover:text-ink"
            aria-label="Cerrar"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${
            centerBody ? "mx-auto w-full max-w-xl" : ""
          }`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
