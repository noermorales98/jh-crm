"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Bell,
  Globe,
  Laptop,
  LogOut,
  Moon,
  ScrollText,
  Settings,
  Sun,
  UserCog,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCuelumeMute } from "@/src/components/cuelume/cuelume-provider";
import { useTheme } from "@/src/components/theme/theme-provider";
import { THEME_OPTIONS } from "@/src/components/theme/theme";
import { ChangeEmailDialog } from "@/src/components/users/change-email-dialog";
import { useOverlayCoords } from "./use-overlay-coords";

/**
 * Menú de usuario del header: avatar circular que abre un dropdown
 * (overlay) con datos del usuario, atajos según rol y sign out.
 *
 * <UserMenu name="Ada Lovelace" email="ada@jh.com" role="OWNER" />
 */

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Propietario",
  ADMIN: "Administrador",
  SPECIALIST: "Especialista",
  STAFF: "Staff",
  VIEWER: "Solo lectura",
};

const MENU_ITEM_CLASSES =
  "flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-[13px] font-medium text-ink transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none";
const MENU_ICON_CLASSES = "size-4 shrink-0 text-text-secondary-strong";
const THEME_ICONS = {
  light: Sun,
  dark: Moon,
  auto: Laptop,
} as const;

export function UserMenu({
  name,
  email,
  role,
}: {
  name: string;
  email: string;
  role: string | null;
}) {
  const [open, setOpen] = useState(false);
  const { muted, setMuted } = useCuelumeMute();
  const { theme, setTheme } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const coords = useOverlayCoords(open, buttonRef);

  const isManager = role === "OWNER" || role === "ADMIN";
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : null;

  function focusItem(index: number) {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"], [role="menuitemradio"]',
    );
    if (!items || items.length === 0) return;
    const clamped = (index + items.length) % items.length;
    items[clamped]?.focus();
  }

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function onButtonKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      if (!open) {
        event.preventDefault();
        setOpen(true);
        // Esperar al render para enfocar el primer ítem.
        requestAnimationFrame(() => focusItem(0));
      }
    }
  }

  function onMenuKeyDown(event: React.KeyboardEvent) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"], [role="menuitemradio"]',
      ) ?? [],
    );
    const current = items.indexOf(document.activeElement as HTMLElement);

    switch (event.key) {
      case "Escape":
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        break;
      case "ArrowDown":
        event.preventDefault();
        focusItem(current + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(current <= 0 ? items.length - 1 : current - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(items.length - 1);
        break;
      case "Tab":
        setOpen(false);
        break;
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menú de ${name}`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
        data-cuelume-toggle="toggle"
        className="relative size-9 overflow-hidden rounded-full ring-1 ring-border-subtle transition-opacity duration-200 hover:opacity-90 motion-reduce:transition-none"
      >
        <Image
          src="/avatar.png"
          alt=""
          width={36}
          height={36}
          className="size-9 object-cover"
          sizes="36px"
        />
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Cuenta"
              onKeyDown={onMenuKeyDown}
              style={{ top: coords.top, right: coords.right }}
              className="jh-material jh-overlay-shadow fixed z-dropdown w-72 overflow-hidden rounded-surface border border-border-subtle py-1.5"
            >
          <div className="px-3.5 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-text-secondary">{email}</p>
            {roleLabel ? (
              <p className="mt-0.5 text-xs text-text-secondary">{roleLabel}</p>
            ) : null}
            <div className="mt-2">
              <ChangeEmailDialog
                mode="own"
                currentEmail={email}
                triggerClassName="text-xs font-medium text-action-primary hover:underline"
                triggerLabel="Cambiar correo de acceso"
              />
            </div>
          </div>

          <div className="mx-3 my-1 h-px bg-border-subtle" role="separator" />

          <div className="px-3 py-2">
            <p id="theme-label" className="mb-1.5 text-[13px] font-semibold text-text-secondary">
              Apariencia
            </p>
            <div
              role="group"
              aria-labelledby="theme-label"
              className="grid grid-cols-3 gap-0.5 rounded-control bg-surface-panel/80 p-0.5"
            >
              {THEME_OPTIONS.map((option) => {
                const Icon = THEME_ICONS[option.value];
                const selected = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    aria-label={option.value === "auto" ? "Automático" : option.label}
                    data-cuelume-toggle="toggle"
                    onClick={() => setTheme(option.value)}
                    className={`flex min-h-8 items-center justify-center gap-1 rounded-[8px] px-1.5 text-[13px] font-medium transition-colors duration-200 motion-reduce:transition-none ${
                      selected
                        ? "bg-surface-elevated text-ink shadow-sm"
                        : "text-text-secondary hover:text-ink"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-3 my-1 h-px bg-border-subtle" role="separator" />

          <div className="px-1.5">
            <a
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => setOpen(false)}
              data-cuelume-hover="tick"
              className={MENU_ITEM_CLASSES}
            >
              <Globe className={MENU_ICON_CLASSES} aria-hidden />
              Ir al sitio web principal
            </a>
            <Link
              href="/crm/configuracion"
              role="menuitem"
              onClick={() => setOpen(false)}
              data-cuelume-hover="tick"
              className={MENU_ITEM_CLASSES}
            >
              <Settings className={MENU_ICON_CLASSES} aria-hidden />
              Configuración
            </Link>
            {isManager ? (
              <>
                <Link
                  href="/crm/configuracion/notificaciones"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  data-cuelume-hover="tick"
                  className={MENU_ITEM_CLASSES}
                >
                  <Bell className={MENU_ICON_CLASSES} aria-hidden />
                  Notificaciones
                </Link>
                <Link
                  href="/crm/usuarios"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  data-cuelume-hover="tick"
                  className={MENU_ITEM_CLASSES}
                >
                  <UserCog className={MENU_ICON_CLASSES} aria-hidden />
                  Usuarios
                </Link>
                <Link
                  href="/crm/auditoria"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  data-cuelume-hover="tick"
                  className={MENU_ITEM_CLASSES}
                >
                  <ScrollText className={MENU_ICON_CLASSES} aria-hidden />
                  Auditoría
                </Link>
              </>
            ) : null}
          </div>

          <div className="mx-3 my-1 h-px bg-border-subtle" role="separator" />

          <div className="px-1.5">
            <button
              type="button"
              role="menuitem"
              data-cuelume-toggle="toggle"
              onClick={() => setMuted(!muted)}
              className={MENU_ITEM_CLASSES}
            >
              {muted ? (
                <VolumeX className={MENU_ICON_CLASSES} aria-hidden />
              ) : (
                <Volume2 className={MENU_ICON_CLASSES} aria-hidden />
              )}
              {muted ? "Activar sonidos" : "Silenciar sonidos"}
            </button>
            <form
              action={() => {
                void signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                role="menuitem"
                data-cuelume-hover="tick"
                className={MENU_ITEM_CLASSES}
              >
                <LogOut className={MENU_ICON_CLASSES} aria-hidden />
                Cerrar sesión
              </button>
            </form>
          </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
