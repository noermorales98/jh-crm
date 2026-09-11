import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";

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
        className="mb-1.5 block text-[13px] font-medium text-text-secondary-strong"
      >
        {label}
        {required ? (
          <>
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
            <span className="sr-only"> (obligatorio)</span>
          </>
        ) : null}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1 flex items-start gap-1 text-[13px] text-danger-ink">
          <CircleAlert className="mt-px size-3.5 shrink-0" strokeWidth={2} aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="mt-1 text-[13px] text-text-secondary">{hint}</p>
      ) : null}
    </div>
  );
}
