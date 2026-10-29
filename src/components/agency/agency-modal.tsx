"use client";

import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropIntentRef = useRef(false);
  const closingFromCleanup = useRef(false);

  useLayoutEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    return () => {
      document.body.style.overflow = previous;
      if (!dialog.open) return;
      // close() saca el dialog del top layer. Sin esto, al desmontar
      // el resto de la página puede quedarse inert.
      closingFromCleanup.current = true;
      dialog.close();
      closingFromCleanup.current = false;
    };
  }, [open]);

  if (!open) return null;

  function pickerOpen() {
    return Boolean(dialogRef.current?.querySelector("[data-jh-picker]"));
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      tabIndex={-1}
      onCancel={(event) => {
        if (pickerOpen() || !closeOnEscape) event.preventDefault();
      }}
      onClose={() => {
        if (closingFromCleanup.current) return;
        onClose();
      }}
      onMouseDown={(event) => {
        if (pickerOpen()) {
          backdropIntentRef.current = false;
          return;
        }
        backdropIntentRef.current = event.target === dialogRef.current;
      }}
      onClick={(event) => {
        if (pickerOpen()) {
          backdropIntentRef.current = false;
          return;
        }
        if (event.target === dialogRef.current && backdropIntentRef.current) {
          onClose();
        }
        backdropIntentRef.current = false;
      }}
      className="fixed inset-0 z-modal m-0 h-dvh max-h-none w-full max-w-none items-center justify-center border-0 bg-transparent p-4 outline-none backdrop:bg-ink/55 backdrop:backdrop-blur-[2px] open:flex sm:p-6"
    >
      <div
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
          className={`min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain ${
            centerBody ? "mx-auto w-full max-w-xl" : ""
          }`}
        >
          {children}
        </div>
      </div>
    </dialog>
  );
}
