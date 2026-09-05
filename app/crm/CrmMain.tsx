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
          ? "flex h-[calc(100dvh-3.5rem-4.25rem)] min-h-0 flex-col overflow-hidden outline-none max-lg:pb-[env(safe-area-inset-bottom)] lg:h-[calc(100dvh-4rem)] lg:pb-0"
          : "mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 pb-[calc(5.25rem+env(safe-area-inset-bottom))] outline-none sm:px-5 lg:px-8 lg:py-7 lg:pb-7"
      }
    >
      {children}
    </main>
  );
}
