import type { ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";

/**
 * Tabla estilizada del kit: limpia, divisores sutiles, hover suave.
 *
 * <Table>
 *   <THead><TR><TH>Nombre</TH></TR></THead>
 *   <TBody><TR><TD>...</TD></TR></TBody>
 * </Table>
 */

export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-border-subtle text-sm">
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-app">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return (
    <tbody className="divide-y divide-border-subtle bg-surface-elevated [&>tr]:transition-colors [&>tr]:duration-200 [&>tr:hover]:bg-nav-hover motion-reduce:[&>tr]:transition-none">
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
      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-secondary ${className}`}
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
    <td className={`px-4 py-3 align-middle text-text-secondary-strong ${className}`} {...props}>
      {children}
    </td>
  );
}
