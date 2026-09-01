import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

/**
 * Controles de formulario con estilo uniforme.
 * Blanco, borde sutil, radio 10px, altura 44px; foco con anillo índigo
 * sin desplazar el layout. Usar dentro de <Field> para label + error.
 */

const BASE =
  "block min-h-11 w-full rounded-control border border-border-subtle bg-surface-elevated px-3 py-2.5 text-sm text-ink placeholder:text-text-placeholder focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/15 disabled:cursor-not-allowed disabled:bg-surface-panel disabled:text-text-secondary";

export function inputClasses(invalid?: boolean): string {
  return invalid
    ? BASE.replace(
        "border-border-subtle",
        "border-red-300",
      ).replace("focus:border-focus", "focus:border-red-500")
    : BASE;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className = "", ...props }: InputProps) {
  return <input className={`${inputClasses(invalid)} ${className}`} {...props} />;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function Select({ invalid, className = "", children, ...props }: SelectProps) {
  return (
    <select className={`${inputClasses(invalid)} ${className}`} {...props}>
      {children}
    </select>
  );
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className = "", rows = 3, ...props }: TextareaProps) {
  return (
    <textarea rows={rows} className={`${inputClasses(invalid)} ${className}`} {...props} />
  );
}

/** Input type="date" con el estilo del kit. Valor: "yyyy-MM-dd". */
export function DateInput({ invalid, className = "", ...props }: InputProps) {
  return (
    <input
      type="date"
      className={`${inputClasses(invalid)} ${className}`}
      {...props}
    />
  );
}
