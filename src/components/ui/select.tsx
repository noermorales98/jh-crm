"use client";

import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "./button";
import { inputClasses } from "./input";
import { PickerDialog } from "./picker-dialog";

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

/** Flatten React children into a single label string (fixes cuid fallback). */
function textFromChildren(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromChildren).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return textFromChildren(props.children);
  }
  return "";
}

function optionsFromChildren(children: ReactNode): SelectOption[] {
  const out: SelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type !== "option") return;
    const el = child as ReactElement<{
      value?: string | number;
      disabled?: boolean;
      children?: ReactNode;
    }>;
    const value = el.props.value != null ? String(el.props.value) : "";
    const flattened = textFromChildren(el.props.children).replace(/\s+/g, " ").trim();
    const label = flattened || value;
    out.push({
      value,
      label,
      disabled: Boolean(el.props.disabled),
    });
  });
  return out;
}

type SelectProps = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  "children" | "size"
> & {
  children?: ReactNode;
  options?: SelectOption[];
  invalid?: boolean;
  pickerTitle?: string;
};

/**
 * Select moderno: popup con lista + Cancelar / Confirmar.
 * Usa <dialog showModal()> para verse encima de otros modales.
 */
export function Select({
  children,
  options: optionsProp,
  value,
  defaultValue,
  onChange,
  onBlur,
  name,
  id,
  disabled,
  required,
  invalid,
  className = "",
  pickerTitle = "Elegir opción",
  "aria-label": ariaLabel,
}: SelectProps) {
  const reactId = useId();
  const fieldId = id ?? `select-${reactId}`;
  const titleId = `${fieldId}-title`;
  const options = useMemo(
    () => optionsProp ?? optionsFromChildren(children),
    [optionsProp, children],
  );

  const isControlled = value !== undefined;
  const [uncontrolled, setUncontrolled] = useState(
    defaultValue != null ? String(defaultValue) : "",
  );
  const current = isControlled ? String(value ?? "") : uncontrolled;

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(current);

  useEffect(() => {
    if (open) setDraft(current);
  }, [open, current]);

  const selected = options.find((opt) => opt.value === current);
  const display =
    selected?.label ||
    options.find((opt) => opt.value === "")?.label ||
    "Seleccionar…";

  function commit(next: string) {
    if (!isControlled) setUncontrolled(next);
    onChange?.({
      target: { value: next, name: name ?? "" },
      currentTarget: { value: next, name: name ?? "" },
    } as React.ChangeEvent<HTMLSelectElement>);
  }

  function confirm() {
    commit(draft);
    setOpen(false);
    onBlur?.({} as React.FocusEvent<HTMLSelectElement>);
  }

  function cancel() {
    setDraft(current);
    setOpen(false);
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
        aria-label={ariaLabel}
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
        <ChevronDown
          className="size-4 shrink-0 text-text-secondary"
          aria-hidden
        />
      </button>

      <PickerDialog open={open} onClose={cancel} labelledBy={titleId}>
        <div className="shrink-0 px-5 pt-5 pb-2">
          <h2
            id={titleId}
            className="text-[17px] font-semibold tracking-[-0.02em] text-ink"
          >
            {pickerTitle}
          </h2>
        </div>

        <ul
          role="listbox"
          aria-label={pickerTitle}
          className="flex-1 overflow-y-auto px-2 py-1"
        >
          {options.map((opt) => {
            const active = draft === opt.value;
            return (
              <li key={`${opt.value}::${opt.label}`}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  disabled={opt.disabled}
                  onClick={() => {
                    if (!opt.disabled) setDraft(opt.value);
                  }}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-[12px] px-3 text-left text-[15px] transition-colors ${
                    opt.disabled
                      ? "cursor-not-allowed text-text-secondary opacity-50"
                      : active
                        ? "bg-nav-active font-semibold text-action-primary"
                        : "font-medium text-ink hover:bg-nav-hover"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {active ? (
                    <Check
                      className="size-4 shrink-0"
                      strokeWidth={2.25}
                      aria-hidden
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex shrink-0 gap-2 border-t border-border-subtle/70 px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={cancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            className="flex-1"
            onClick={confirm}
          >
            Confirmar
          </Button>
        </div>
      </PickerDialog>
    </>
  );
}
