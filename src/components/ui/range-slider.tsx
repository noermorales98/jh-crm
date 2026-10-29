"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

export type RangeMark = { value: number; label: string };

/**
 * Control deslizante propio (no el input range del navegador): pista con
 * relleno, perilla grande para el dedo, marcas opcionales y teclado
 * (flechas, Shift = ×10, Inicio/Fin, RePág/AvPág).
 */
export function RangeSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  marks = [],
  label,
  valueText,
  disabled = false,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  marks?: RangeMark[];
  /** Nombre accesible del control. */
  label: string;
  /** Texto que lee el lector de pantalla (p. ej. "9%"). */
  valueText?: string;
  disabled?: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const span = Math.max(max - min, 1);
  const ratio = Math.min(Math.max((value - min) / span, 0), 1);

  function clamp(next: number) {
    const stepped = Math.round((next - min) / step) * step + min;
    return Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
  }

  function fromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return value;
    return clamp(min + ((clientX - rect.left) / rect.width) * span);
  }

  function set(next: number) {
    const clamped = clamp(next);
    if (clamped !== value) onChange(clamped);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const big = step * 10;
    const map: Record<string, number | undefined> = {
      ArrowRight: value + (event.shiftKey ? big : step),
      ArrowUp: value + (event.shiftKey ? big : step),
      ArrowLeft: value - (event.shiftKey ? big : step),
      ArrowDown: value - (event.shiftKey ? big : step),
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    const next = map[event.key];
    if (next === undefined) return;
    event.preventDefault();
    set(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
    set(fromClientX(event.clientX));
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    set(fromClientX(event.clientX));
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  }

  const motion = dragging ? "transition-none" : "transition-[left,width] duration-150 ease-out motion-reduce:transition-none";

  return (
    <div className={disabled ? "opacity-50" : ""}>
      {/* Zona táctil de 44px; la pista visible es delgada. */}
      <div
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        aria-disabled={disabled || undefined}
        onKeyDown={disabled ? undefined : onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={`group relative h-11 touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-action-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface-panel ${
          disabled ? "cursor-not-allowed" : "cursor-pointer"
        }`}
      >
        <div ref={trackRef} className="absolute inset-x-2.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-ink/10">
          <div className={`absolute inset-y-0 left-0 rounded-full bg-action-primary ${motion}`} style={{ width: `${ratio * 100}%` }} />
          {marks.map((mark) => (
            <span
              key={mark.value}
              aria-hidden
              className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-panel/90"
              style={{ left: `${((mark.value - min) / span) * 100}%` }}
            />
          ))}
          <span
            aria-hidden
            className={`absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-panel shadow-[0_1px_3px_rgb(0_0_0/0.22)] ring-2 ring-action-primary ${motion} ${
              dragging ? "scale-110" : "group-hover:scale-105"
            }`}
            style={{ left: `${ratio * 100}%` }}
          />
        </div>
      </div>
      {marks.length > 0 ? (
        <div className="relative mx-2.5 h-4 text-[10.5px] tabular-nums text-text-secondary" aria-hidden>
          {marks.map((mark) => {
            const at = (mark.value - min) / span;
            // Las marcas de los extremos se alinean hacia dentro para no salirse.
            const shift = at <= 0.02 ? "" : at >= 0.98 ? "-translate-x-full" : "-translate-x-1/2";
            return (
              <button
                key={mark.value}
                type="button"
                tabIndex={-1}
                onClick={() => !disabled && set(mark.value)}
                className={`absolute whitespace-nowrap hover:text-ink ${shift}`}
                style={{ left: `${at * 100}%` }}
              >
                {mark.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
