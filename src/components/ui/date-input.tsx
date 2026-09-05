"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";
import { inputClasses } from "./input";
import { PickerDialog } from "./picker-dialog";

const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"] as const;

function parseYmd(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

function toYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function formatDisplay(value: string): string {
  const date = parseYmd(value);
  if (!date) return "";
  return new Intl.DateTimeFormat("es-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("es-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

function buildCells(viewMonth: Date): Array<{ date: Date; inMonth: boolean }> {
  const first = startOfMonth(viewMonth);
  // Lunes = 0 … Domingo = 6
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);

  const cells: Array<{ date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    cells.push({
      date,
      inMonth: date.getMonth() === viewMonth.getMonth(),
    });
  }
  return cells;
}

type DateInputProps = {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string; name: string } }) => void;
  onBlur?: () => void;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  className?: string;
  min?: string;
  max?: string;
  pickerTitle?: string;
  "aria-label"?: string;
};

/**
 * Selector de fecha moderno (popup + calendario + Confirmar/Cancelar).
 * Valor: yyyy-MM-dd. Usa dialog top-layer para verse dentro de modales.
 */
export function DateInput({
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  onBlur,
  disabled,
  required,
  invalid,
  className = "",
  min,
  max,
  pickerTitle = "Elegir fecha",
  "aria-label": ariaLabel,
}: DateInputProps) {
  const reactId = useId();
  const fieldId = id ?? `date-${reactId}`;
  const titleId = `${fieldId}-title`;

  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const current = isControlled ? (value ?? "") : uncontrolled;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);
  const [viewMonth, setViewMonth] = useState(() =>
    startOfMonth(parseYmd(current) ?? new Date()),
  );

  useEffect(() => {
    if (!open) return;
    setDraft(current);
    setViewMonth(startOfMonth(parseYmd(current) ?? new Date()));
  }, [open, current]);

  const cells = useMemo(() => buildCells(viewMonth), [viewMonth]);
  const minDate = min ? parseYmd(min) : null;
  const maxDate = max ? parseYmd(max) : null;
  const todayYmd = toYmd(new Date());
  const display = current ? formatDisplay(current) : "Elegir fecha…";

  function isDisabledDay(date: Date): boolean {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  }

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.({ target: { value: next, name: name ?? "" } });
  }

  function confirm() {
    commit(draft);
    setOpen(false);
    onBlur?.();
  }

  function cancel() {
    setDraft(current);
    setOpen(false);
  }

  function clear() {
    setDraft("");
  }

  return (
    <>
      {name ? (
        <input type="hidden" name={name} value={current} required={required} />
      ) : null}
      <button
        type="button"
        id={fieldId}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel ?? pickerTitle}
        aria-invalid={invalid || undefined}
        aria-required={required || undefined}
        onClick={() => {
          if (!disabled) setOpen(true);
        }}
        className={`${inputClasses(invalid)} flex items-center justify-between gap-2 text-left ${
          disabled ? "" : "cursor-pointer"
        } ${className}`}
      >
        <span
          className={`min-w-0 flex-1 truncate ${
            current ? "text-ink" : "text-text-placeholder"
          }`}
        >
          {display}
        </span>
        <CalendarDays
          className="size-4 shrink-0 text-text-secondary"
          aria-hidden
        />
      </button>

      <PickerDialog open={open} onClose={cancel} labelledBy={titleId}>
        <div className="shrink-0 px-5 pt-5 pb-3">
          <h2
            id={titleId}
            className="text-[17px] font-semibold tracking-[-0.02em] text-ink"
          >
            {pickerTitle}
          </h2>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full text-text-secondary-strong hover:bg-nav-hover hover:text-ink"
              aria-label="Mes anterior"
              onClick={() => setViewMonth((m) => addMonths(m, -1))}
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <p className="text-[15px] font-semibold capitalize tracking-[-0.01em] text-ink">
              {monthLabel(viewMonth)}
            </p>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full text-text-secondary-strong hover:bg-nav-hover hover:text-ink"
              aria-label="Mes siguiente"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>
        </div>

        <div className="px-4 pb-2">
          <div className="mb-1 grid grid-cols-7 gap-1">
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                className="py-1 text-center text-[11px] font-semibold text-text-secondary"
              >
                {day}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map(({ date, inMonth }) => {
              const ymd = toYmd(date);
              const selected = draft === ymd;
              const isToday = ymd === todayYmd;
              const dayDisabled = isDisabledDay(date);
              return (
                <button
                  key={ymd + String(inMonth)}
                  type="button"
                  disabled={dayDisabled}
                  onClick={() => setDraft(ymd)}
                  className={`flex size-10 items-center justify-center rounded-full text-[14px] tabular-nums transition-colors ${
                    dayDisabled
                      ? "cursor-not-allowed text-text-secondary/40"
                      : selected
                        ? "bg-action-primary font-semibold text-action-primary-foreground"
                        : inMonth
                          ? "font-medium text-ink hover:bg-nav-hover"
                          : "text-text-secondary/50 hover:bg-nav-hover"
                  } ${isToday && !selected ? "ring-1 ring-action-primary/40" : ""}`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border-subtle/70 px-4 py-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            className="mr-auto"
          >
            Limpiar
          </Button>
          <Button type="button" variant="secondary" onClick={cancel}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={confirm}>
            Confirmar
          </Button>
        </div>
      </PickerDialog>
    </>
  );
}
