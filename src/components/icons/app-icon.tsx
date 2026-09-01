"use client";

import { Home01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "./icon";

/**
 * Marca visual de la app: icono Home de Hugeicons Free
 * sobre el fondo índigo de marca.
 */
export function AppIcon({ size = "sm" }: { size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-12 w-12 rounded-surface" : "h-9 w-9 rounded-control";
  const iconSize = size === "lg" ? 24 : 18;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center bg-action-primary text-action-primary-foreground ${box}`}
    >
      <Icon icon={Home01Icon} size={iconSize} aria-hidden />
    </span>
  );
}
