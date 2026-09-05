"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

/**
 * Modal sencillo (client). Se controla con `open` + `onClose`.
 * En móvil se comporta como hoja inferior (sheet).
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** md = formularios; xl = editor de documentos */
  size?: "md" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropIntentRef = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function pickerOpen() {
    return Boolean(ref.current?.querySelector("[data-jh-picker]"));
  }

  const panelWidth = size === "xl" ? "max-w-3xl" : "max-w-lg";

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(event) => {
        if (pickerOpen()) {
          event.preventDefault();
        }
      }}
      onMouseDown={(event) => {
        if (pickerOpen()) {
          backdropIntentRef.current = false;
          return;
        }
        backdropIntentRef.current = event.target === ref.current;
      }}
      onClick={(event) => {
        if (pickerOpen()) {
          event.preventDefault();
          event.stopPropagation();
          backdropIntentRef.current = false;
          return;
        }
        if (event.target === ref.current && backdropIntentRef.current) {
          onClose();
        }
        backdropIntentRef.current = false;
      }}
      className="fixed inset-0 z-modal m-0 hidden h-dvh max-h-dvh w-full max-w-none items-end justify-center bg-transparent p-0 backdrop:bg-ink/40 backdrop:backdrop-blur-[2px] open:flex sm:items-center sm:p-4"
    >
      <div
        className={`jh-overlay-shadow relative flex max-h-[min(92dvh,100%)] w-full ${panelWidth} flex-col overflow-hidden rounded-t-[20px] bg-surface-elevated pb-[env(safe-area-inset-bottom)] sm:max-h-full sm:rounded-surface sm:pb-0`}
      >
        <div
          className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-subtle sm:hidden"
          aria-hidden
        />
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
            ) : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="Cerrar"
            className="size-9 shrink-0 px-0"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">
          {children}
        </div>
        {footer ? (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border-subtle px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </dialog>
  );
}
