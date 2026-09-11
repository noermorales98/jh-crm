import type { ButtonHTMLAttributes } from "react";
import Link from "next/link";

/**
 * Botón base del UI kit. Variantes: primary (acción principal, índigo),
 * secondary (gris iOS: panel con hairline), success (positivo), danger
 * (destructivas), ghost (link-botón tintado, sin fondo).
 */

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "success"
  | "danger"
  | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-action-primary font-semibold text-action-primary-foreground hover:bg-action-secondary active:brightness-95 disabled:opacity-50",
  secondary:
    "bg-surface-panel font-medium text-ink border border-border-subtle hover:bg-nav-hover active:brightness-95 disabled:opacity-50",
  success:
    "bg-success-ink font-semibold text-success-foreground hover:brightness-110 active:brightness-95 disabled:opacity-50",
  danger:
    "bg-danger font-semibold text-white hover:bg-danger-hover active:brightness-95 disabled:opacity-50",
  ghost:
    "font-medium text-action-primary hover:bg-nav-hover active:bg-nav-active disabled:opacity-50",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-[13px]",
  md: "min-h-11 px-4 text-sm",
};

export function buttonClasses(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
): string {
  return `inline-flex items-center justify-center gap-1.5 rounded-control transition-[colors,transform,filter] duration-200 ease-out motion-reduce:transition-none active:scale-[0.98] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]}`;
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
      data-cuelume-press="press"
      data-cuelume-release="release"
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
    <Link
      href={href}
      className={`${buttonClasses(variant, size)} ${className}`}
      data-cuelume-press="press"
      data-cuelume-release="release"
    >
      {children}
    </Link>
  );
}
