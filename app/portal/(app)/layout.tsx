import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import {
  FileText,
  MessageSquareQuote,
  Home,
  CreditCard,
  LineChart,
  FolderOpen,
  LogOut,
} from "lucide-react";
import { requirePortalSession } from "@/src/server/auth/guards";
import { isPortalEnabled } from "@/src/server/portal";
import { AppIcon } from "@/src/components/icons/app-icon";
import { Button } from "@/src/components/ui";
import { PortalNav } from "@/src/components/portal/portal-nav";

export const metadata: Metadata = {
  title: {
    default: "Portal — J&H Multiservices",
    template: "%s — Portal J&H",
  },
};

const NAV = [
  { href: "/portal", label: "Inicio", icon: Home },
  { href: "/portal/progreso", label: "Progreso", icon: LineChart },
  { href: "/portal/documentos", label: "Documentos", icon: FolderOpen },
  { href: "/portal/reportes", label: "Reportes", icon: FileText },
  { href: "/portal/pagos", label: "Pagos", icon: CreditCard },
  { href: "/portal/testimonios", label: "Testimonios", icon: MessageSquareQuote },
] as const;

export default async function PortalAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isPortalEnabled()) {
    redirect("/portal/login");
  }

  const portal = await requirePortalSession();

  return (
    <div className="min-h-screen bg-surface-app">
      <header className="sticky top-0 z-sticky  bg-surface-elevated pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <AppIcon size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Portal del cliente</p>
              <p className="truncate text-xs text-text-secondary">{portal.email}</p>
            </div>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/portal/login" });
            }}
          >
            <Button type="submit" size="sm" variant="ghost">
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Salir</span>
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-[calc(5.25rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <PortalNav items={NAV} />
    </div>
  );
}
