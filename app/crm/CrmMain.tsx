"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function CrmMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chatDetail = /^\/crm\/chats\/[^/]+$/.test(pathname);

  return (
    <main
      id="contenido-principal"
      tabIndex={-1}
      className={
        chatDetail
          ? "flex h-[calc(100dvh-3.5rem)] min-h-0 flex-col overflow-hidden outline-none lg:h-[calc(100dvh-4rem)]"
          : "flex-1 px-4 py-5 outline-none lg:px-8 lg:py-6"
      }
    >
      {children}
    </main>
  );
}
