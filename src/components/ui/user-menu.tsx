"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, ScrollText, Settings, UserCog, Volume2, VolumeX } from "lucide-react";
import { useCuelumeMute } from "@/src/components/cuelume/cuelume-provider";

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
  "flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-left text-sm font-medium text-ink transition-colors duration-200 hover:bg-nav-hover motion-reduce:transition-none";
const MENU_ICON_CLASSES = "size-4 shrink-0 text-text-secondary-strong";

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
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const isManager = role === "OWNER" || role === "ADMIN";
  const roleLabel = role ? (ROLE_LABELS[role] ?? role) : null;

  function focusItem(index: number) {
    const items = menuRef.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]',
    );
    if (!items || items.length === 0) return;
    const clamped = (index + items.length) % items.length;
    items[clamped]?.focus();
  }

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
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
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
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
        className="relative size-9 overflow-hidden rounded-full transition-opacity duration-200 hover:opacity-90 motion-reduce:transition-none"
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

      {open ? (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Cuenta"
          onKeyDown={onMenuKeyDown}
          className="jh-overlay-shadow absolute right-0 top-full z-20 mt-2 w-64 rounded-surface bg-surface-elevated py-1.5"
        >
          <div className="px-3.5 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-text-secondary">{email}</p>
            {roleLabel ? (
              <p className="mt-0.5 text-xs text-text-secondary">{roleLabel}</p>
            ) : null}
          </div>

          <div className="mx-3 my-1 h-px bg-border-subtle" role="separator" />

          <div className="px-1.5">
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
        </div>
      ) : null}
    </div>
  );
}
