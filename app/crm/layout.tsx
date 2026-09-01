import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import "@fontsource/open-sauce-two/400.css";
import "@fontsource/open-sauce-two/500.css";
import "@fontsource/open-sauce-two/600.css";
import "@fontsource/open-sauce-two/700.css";
import { auth } from "@/auth";
import { UserMenu } from "@/src/components/ui";
import { AppIcon } from "@/src/components/icons/app-icon";
import { NotificationBell } from "@/src/components/notifications/notification-bell";
import {
  countUnreadNotifications,
  listNotificationsForUser,
} from "@/src/server/notifications";
import { SidebarNav } from "./SidebarNav";

export const metadata: Metadata = {
  title: {
    default: "J&H CRM — J&H Multiservices LLC",
    template: "%s — J&H CRM",
  },
  description: "CRM interno de J&H Multiservices LLC",
};

export default async function CrmLayout({ children }: LayoutProps<"/crm">) {
  // Barrera de servidor: el layout nunca renderiza sin sesión.
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const userName = session.user.name ?? session.user.email ?? "Usuario";
  const organizationId = session.user.currentOrganizationId;
  const [inbox, unreadCount] = organizationId
    ? await Promise.all([
        listNotificationsForUser(organizationId, session.user.id),
        countUnreadNotifications(organizationId, session.user.id),
      ])
    : [[], 0];

  return (
    <div className="flex min-h-screen bg-surface-app">
      <aside className="fixed inset-y-0 left-0 flex w-64 flex-col bg-surface-panel">
        <div className="flex h-16 items-center gap-3 px-5">
          <Link
            href="/crm/dashboard"
            className="flex min-w-0 items-center gap-3"
            aria-label="Ir al inicio"
          >
            <AppIcon />
            <p className="truncate text-sm font-semibold text-ink">J&H CRM</p>
          </Link>
        </div>
        <SidebarNav />
      </aside>

      <div className="flex min-h-screen flex-1 flex-col pl-64">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between bg-surface-app px-6">
          <span className="text-sm font-medium text-text-secondary">
            J&H Multiservices LLC
          </span>
          <div className="flex items-center gap-2">
            <NotificationBell
              unreadCount={unreadCount}
              items={inbox.map((item) => ({
                id: item.id,
                type: item.type,
                title: item.title,
                body: item.body,
                link: item.link,
                isRead: item.isRead,
                createdAt: item.createdAt.toISOString(),
              }))}
            />
            <UserMenu
              name={userName}
              email={session.user.email ?? ""}
              role={session.user.role ?? null}
            />
          </div>
        </header>
        <main className="flex-1 px-6 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
