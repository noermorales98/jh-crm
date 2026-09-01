import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";

/**
 * Botón base del UI kit. Variantes: primary (acción principal, índigo),
 * secondary (Lavanda con texto Obsidiana), danger (destructivas),
 * ghost (discretas, dentro de tablas).
 */

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-action-primary font-semibold text-action-primary-foreground hover:bg-action-secondary disabled:opacity-60",
  secondary:
    "bg-surface-panel font-medium text-ink hover:bg-nav-active disabled:opacity-60",
  danger:
    "bg-red-600 font-semibold text-white hover:bg-red-700 disabled:opacity-60",
  ghost:
    "font-medium text-text-secondary-strong hover:bg-surface-panel hover:text-ink disabled:opacity-60",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-10 px-3 text-sm",
  md: "min-h-11 px-4 text-sm",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
): string {
  return `inline-flex items-center justify-center gap-1.5 rounded-control transition-colors duration-200 motion-reduce:transition-none disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`${buttonClasses(variant, size)} ${className}`}
      {...props}
    />
  );
}

/** Link con apariencia de botón (navegación, sin JS). */
export function ButtonLink({
  href,
  variant = "primary",
  size = "md",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${buttonClasses(variant, size)} ${className}`}>
      {children}
    </Link>
  );
}
