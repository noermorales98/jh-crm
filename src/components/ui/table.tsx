import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * Tabla sobre fondo blanco del Card: cabecera clara, filas limpias.
 */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">{children}</table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-border-subtle">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="bg-surface-elevated [&>tr]:border-b [&>tr]:border-border-subtle [&>tr:last-child]:border-b-0 [&>tr]:transition-colors [&>tr]:duration-150 [&>tr:hover]:bg-nav-hover motion-reduce:[&>tr]:transition-none">
      {children}
    </tbody>
  );
}

export function TR({
  className = "",
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <tr className={className}>{children}</tr>;
}

export function TH({
  className = "",
  children,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      scope="col"
      className={`bg-surface-elevated px-4 py-3 text-left text-[11px] font-semibold text-text-secondary ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}

export function TD({
  className = "",
  children,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={`px-4 py-3 align-middle text-[13px] text-ink ${className}`}
      {...props}
    >
      {children}
    </td>
  );
}
