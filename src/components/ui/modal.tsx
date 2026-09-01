"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./button";

/**
 * Modal sencillo (client). Se controla con `open` + `onClose`.
 *
 * const [open, setOpen] = useState(false);
 * <Modal open={open} onClose={() => setOpen(false)} title="Crear tarea">
 *   ...
 * </Modal>
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // Clic en el backdrop cierra.
        if (e.target === ref.current) onClose();
      }}
      className="jh-overlay-shadow w-full max-w-lg rounded-surface bg-surface-elevated p-0 backdrop:bg-ink/40"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Cerrar">
          <X className="size-4" aria-hidden />
        </Button>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer ? (
        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
