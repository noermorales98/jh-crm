import type { ReactNode } from "react";

/**
 * Field: envoltorio label + control + error/hint para formularios.
 *
 * <Field label="Nombre" htmlFor="firstName" required>
 *   <Input id="firstName" name="firstName" />
 * </Field>
 */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className = "",
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-semibold text-text-secondary-strong"
      >
        {label}
        {required ? <span className="ml-0.5 text-red-500">*</span> : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-text-secondary">{hint}</p>
      ) : null}
    </div>
  );
}
