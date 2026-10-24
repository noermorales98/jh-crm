"use client";

import { useRef, useState } from "react";

const PRESETS = [0, 10, 30, 100] as const;

/**
 * Escenario de utilización. Control propio: la pista nativa del navegador
 * no entra en la vista. Un paso de deshacer vuelve al valor anterior al
 * gesto o al atajo.
 */
export function UtilizationScenarioSlider({
  value,
  onChange,
  min = 0,
  max = 100,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const gestureStart = useRef<number | null>(null);
  const undoValue = useRef<number | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [dragging, setDragging] = useState(false);

  valueRef.current = value;

  function clamp(next: number) {
    return Math.min(max, Math.max(min, Math.round(next)));
  }

  function valueFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return value;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return clamp(min + ratio * (max - min));
  }

  function rememberUndo(previous: number, next: number) {
    if (previous === next) return;
    undoValue.current = previous;
    setCanUndo(true);
  }

  function choose(next: number) {
    const clamped = clamp(next);
    rememberUndo(value, clamped);
    if (clamped !== value) onChange(clamped);
  }

  function undo() {
    if (undoValue.current == null) return;
    const previous = undoValue.current;
    undoValue.current = null;
    setCanUndo(false);
    onChange(previous);
  }

  const span = max - min;
  const ratio = span === 0 ? 0 : (value - min) / span;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <p className="text-[40px] font-semibold leading-none tabular-nums tracking-[-0.04em] text-ink">
          {value}
          <span className="ml-0.5 text-[20px] font-medium text-text-secondary">
            %
          </span>
        </p>
        {canUndo ? (
          <button
            type="button"
            className="mb-1 min-h-11 rounded-control px-3 text-[13px] font-medium text-action-primary outline-none hover:bg-nav-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98] motion-reduce:active:scale-100"
            onClick={undo}
          >
            Deshacer
          </button>
        ) : (
          <span className="mb-1 text-[13px] text-text-secondary">Escenario</span>
        )}
      </div>

      <div
        role="slider"
        tabIndex={0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value}%`}
        aria-label="Escenario de utilización"
        className="relative h-11 cursor-pointer touch-none outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          if (event.key === "ArrowRight" || event.key === "ArrowUp") {
            event.preventDefault();
            choose(value + step);
          } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
            event.preventDefault();
            choose(value - step);
          } else if (event.key === "Home") {
            event.preventDefault();
            choose(min);
          } else if (event.key === "End") {
            event.preventDefault();
            choose(max);
          }
        }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          gestureStart.current = valueRef.current;
          setDragging(true);
          onChange(valueFromClientX(event.clientX));
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          onChange(valueFromClientX(event.clientX));
        }}
        onPointerUp={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const next = valueFromClientX(event.clientX);
          onChange(next);
          const start = gestureStart.current;
          gestureStart.current = null;
          setDragging(false);
          if (start != null) rememberUndo(start, next);
        }}
        onPointerCancel={() => {
          const start = gestureStart.current;
          gestureStart.current = null;
          setDragging(false);
          if (start != null) rememberUndo(start, valueRef.current);
        }}
      >
        <div
          ref={trackRef}
          className="absolute inset-x-[22px] top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink/10"
        >
          <div
            className={`h-full w-full origin-left rounded-full bg-action-primary ease-out motion-reduce:transition-none ${
              dragging
                ? "transition-none"
                : "transition-transform duration-200"
            }`}
            style={{ transform: `scaleX(${ratio})` }}
          />
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-[22px] top-1/2 h-11 -translate-y-1/2"
          style={{ containerType: "inline-size" }}
        >
          <span
            className={`absolute left-0 top-0 size-11 ease-out motion-reduce:transition-none ${
              dragging ? "transition-none" : "transition-transform duration-200"
            }`}
            style={{ transform: `translateX(calc(${ratio} * 100cqw - 22px))` }}
          >
            <span className="absolute left-1/2 top-1/2 size-[18px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-panel shadow-[0_1px_2px_rgb(0_0_0/0.16)] ring-1 ring-ink/15" />
          </span>
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2">
        {PRESETS.map((preset) => {
          const selected = value === preset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={selected}
              onClick={() => choose(preset)}
              className={`min-h-11 rounded-control text-[13px] font-medium tabular-nums outline-none transition-transform duration-200 ease-out focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 ${
                selected
                  ? "bg-action-primary text-action-primary-foreground"
                  : "bg-nav-hover text-ink hover:bg-ink/10"
              }`}
            >
              {preset}%
            </button>
          );
        })}
      </div>
    </div>
  );
}
