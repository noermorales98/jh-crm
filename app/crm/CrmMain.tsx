"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function CrmMain({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const chatDetail = /^\/crm\/chats\/[^/]+$/.test(pathname);

  return (
    <main
      className={
        chatDetail
          ? "flex h-[calc(100dvh-4rem)] min-h-0 flex-col overflow-hidden"
          : "flex-1 px-6 py-6 lg:px-8"
      }
    >
      {children}
    </main>
  );
}
