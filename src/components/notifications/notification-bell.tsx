"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/src/actions/notifications";
import { formatRelative } from "@/src/lib/format";
import { NOTIFICATION_TYPE_LABELS, labelFor } from "@/src/lib/labels";
import { useOverlayCoords } from "@/src/components/ui/use-overlay-coords";

export interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function NotificationBell({
  items,
  unreadCount,
}: {
  items: NotificationItem[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const coords = useOverlayCoords(open, buttonRef);
  const [, startTransition] = useTransition();

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

  function onSelect(item: NotificationItem) {
    setOpen(false);
    startTransition(async () => {
      if (!item.isRead) {
        await markNotificationRead(item.id);
      }
      if (item.link) router.push(item.link);
      else router.refresh();
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          unreadCount > 0
            ? `Notificaciones, ${unreadCount} sin leer`
            : "Notificaciones"
        }
        onClick={() => setOpen((v) => !v)}
        data-cuelume-toggle="toggle"
        className="relative flex size-9 items-center justify-center rounded-full text-text-secondary-strong transition-colors duration-200 hover:bg-nav-hover hover:text-ink motion-reduce:transition-none"
      >
        <Bell className="size-5" aria-hidden />
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-action-primary px-1 text-[11px] font-semibold text-action-primary-foreground">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open && coords
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              aria-label="Notificaciones"
              style={{ top: coords.top, right: coords.right }}
              className="jh-material jh-overlay-shadow fixed z-dropdown w-80 overflow-hidden rounded-surface"
            >
          <div className="flex items-center justify-between px-3.5 py-2.5">
            <p className="text-sm font-semibold text-ink">Notificaciones</p>
            {unreadCount > 0 ? (
              <button
                type="button"
                className="min-h-8 text-[13px] font-medium text-action-primary hover:text-action-secondary"
                onClick={() => {
                  startTransition(async () => {
                    await markAllNotificationsRead();
                    router.refresh();
                  });
                }}
              >
                Marcar leídas
              </button>
            ) : null}
          </div>
          <div className="mx-3 h-px bg-border-subtle" />
          {items.length === 0 ? (
            <p className="px-3.5 py-8 text-center text-sm text-text-secondary">
              No hay avisos todavía.
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {items.map((item) => (
                <li key={item.id}>
                  {item.link ? (
                    <Link
                      href={item.link}
                      role="menuitem"
                      onClick={(event) => {
                        event.preventDefault();
                        onSelect(item);
                      }}
                      className={`block px-3.5 py-2.5 text-left transition-colors hover:bg-nav-hover ${
                        item.isRead ? "" : "bg-nav-active/50"
                      }`}
                    >
                      <NotificationRow item={item} />
                    </Link>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => onSelect(item)}
                      className={`block w-full px-3.5 py-2.5 text-left transition-colors hover:bg-nav-hover ${
                        item.isRead ? "" : "bg-nav-active/50"
                      }`}
                    >
                      <NotificationRow item={item} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function NotificationRow({ item }: { item: NotificationItem }) {
  return (
    <>
      <p className="text-[13px] font-medium text-text-secondary">
        {labelFor(NOTIFICATION_TYPE_LABELS, item.type)}
      </p>
      <p className="mt-0.5 text-sm font-medium text-ink">{item.title}</p>
      {item.body ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-text-secondary">{item.body}</p>
      ) : null}
      <p className="mt-1 text-xs text-text-secondary">
        {formatRelative(item.createdAt)}
      </p>
    </>
  );
}
