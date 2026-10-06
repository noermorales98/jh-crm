import type { ReactNode } from "react";
import { FondifyTopbar } from "./fondify-topbar";
import { FondifySidebar } from "./fondify-sidebar";

export function FondifyLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen grid-cols-[var(--ff-sidebar-width)_1fr] grid-rows-[var(--ff-topbar-height)_1fr]">
      <FondifyTopbar />
      <FondifySidebar />
      <main className="col-start-2 row-start-2 bg-[var(--ff-bg)] p-6">
        {children}
      </main>
    </div>
  );
}
