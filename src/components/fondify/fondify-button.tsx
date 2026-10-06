/**
 * Fondify Button — botones estilo Fondify Agency
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type ButtonVariant = "primary" | "outlined" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

type BaseButtonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
};

type ButtonProps = BaseButtonProps & React.ButtonHTMLAttributes<HTMLButtonElement> & {
  href?: never;
};

type LinkButtonProps = BaseButtonProps & {
  href: string;
};

function getButtonStyles(variant: ButtonVariant, size: ButtonSize) {
  const variantStyles = {
    primary:
      "bg-[var(--ff-primary)] text-[var(--ff-text-inverse)] hover:bg-[var(--ff-primary-hover)] active:bg-[var(--ff-primary-pressed)]",
    outlined:
      "border-2 border-[var(--ff-primary)] text-[var(--ff-primary)] bg-transparent hover:bg-[var(--ff-primary-tint)]",
    ghost:
      "border border-[var(--ff-border)] text-[var(--ff-text-secondary)] bg-transparent hover:bg-[var(--ff-primary-tint)]",
    danger:
      "border-2 border-[var(--color-danger)] text-[var(--color-danger)] bg-transparent hover:bg-[var(--color-danger-soft)]",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-[var(--ff-fs-sm)]",
    md: "px-4 py-2 text-[var(--ff-fs-base)]",
    lg: "px-6 py-3 text-[var(--ff-fs-lg)]",
  };

  return `${variantStyles[variant]} ${sizeStyles[size]}`;
}

export function FondifyButton({
  variant = "primary",
  size = "md",
  icon: Icon,
  children,
  className = "",
  href,
  ...props
}: ButtonProps | LinkButtonProps) {
  const baseStyles = `inline-flex items-center justify-center gap-2 rounded-[var(--ff-radius-md)] font-semibold transition-colors ${getButtonStyles(variant, size)} ${className}`;

  const content = (
    <>
      {Icon && <Icon className="size-4" strokeWidth={2} />}
      <span>{children}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={baseStyles}>
        {content}
      </Link>
    );
  }

  return (
    <button {...(props as ButtonProps)} className={baseStyles}>
      {content}
    </button>
  );
}
