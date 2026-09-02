"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const SPLIT_LISTS = new Set([
  "/crm/clientes",
  "/crm/casos",
  "/crm/tareas",
  "/crm/rondas",
  "/crm/cotizaciones",
  "/crm/pagos",
  "/crm/recibos",
  "/crm/chats",
]);

export function CrmMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chatDetail = /^\/crm\/chats\/[^/]+$/.test(pathname);
  const splitList = SPLIT_LISTS.has(pathname);

  return (
    <main
      className={
        chatDetail || splitList
          ? "flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden px-6 py-4 lg:px-8"
          : "flex-1 px-6 py-6 lg:px-8"
      }
    >
      {children}
    </main>
  );
}
