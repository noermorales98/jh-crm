"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Coords = { top: number; left: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Tooltip ligero: hover/focus sobre el ancla; sin fetch.
 */
export function Tooltip({
  content,
  children,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipId = useId();

  const update = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const top = side === "top" ? rect.top - 8 : rect.bottom + 8;
    setCoords({
      top,
      left: clamp(rect.left + rect.width / 2, 12, window.innerWidth - 12),
    });
  }, [side]);

  useEffect(() => {
    if (!open) return;
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, update]);

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? tipId : undefined}
    >
      {children}
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              id={tipId}
              role="tooltip"
              className="pointer-events-none fixed z-[80] max-w-xs -translate-x-1/2 rounded-control border border-border-subtle bg-surface-elevated px-2.5 py-1.5 text-xs text-ink shadow-md"
              style={{
                top: side === "top" ? undefined : coords.top,
                bottom:
                  side === "top"
                    ? `${window.innerHeight - coords.top}px`
                    : undefined,
                left: coords.left,
                transform:
                  side === "top"
                    ? "translate(-50%, -100%)"
                    : "translate(-50%, 0)",
              }}
            >
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

/**
 * Popover anclado: click para abrir; cierra fuera / Escape.
 */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "end" | "center";
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
  } | null>(null);

  useEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }
    function update() {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let left = rect.left;
      if (align === "end") left = rect.right;
      if (align === "center") left = rect.left + rect.width / 2;
      setCoords({ top: rect.bottom + 6, left });
    }
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const t = event.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onOpenChange(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  const transform =
    align === "end"
      ? "translateX(-100%)"
      : align === "center"
        ? "translateX(-50%)"
        : undefined;

  return (
    <div ref={rootRef} className="relative inline-flex">
      <div
        ref={buttonRef}
        onClick={() => onOpenChange(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onOpenChange(!open);
          }
        }}
      >
        {trigger}
      </div>
      {open && coords && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              className="fixed z-[80] min-w-[14rem] max-w-sm rounded-control border border-border-subtle bg-surface-elevated p-3 text-sm text-ink shadow-lg"
              style={{ top: coords.top, left: coords.left, transform }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
