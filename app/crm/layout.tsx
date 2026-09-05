import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import "@fontsource/open-sauce-two/400.css";
import "@fontsource/open-sauce-two/500.css";
import "@fontsource/open-sauce-two/600.css";
import "@fontsource/open-sauce-two/700.css";
import { auth } from "@/auth";
import { UserMenu } from "@/src/components/ui";
import { NotificationBell } from "@/src/components/notifications/notification-bell";
import {
  countUnreadNotifications,
  listNotificationsForUser,
} from "@/src/server/notifications";
import { CrmShell } from "@/src/components/layout/crm-shell";
import { SidebarNav } from "./SidebarNav";
import { CrmHeader, HeaderTitleProvider } from "./CrmHeader";
import { CrmMain } from "./CrmMain";
import { CrmChat } from "@/src/components/ai/crm-chat";

export const metadata: Metadata = {
  title: {
    default: "J&H CRM — J&H Multiservices LLC",
    template: "%s — J&H CRM",
  },
  description: "CRM interno de J&H Multiservices LLC",
};

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-jh-display",
  weight: ["700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-jh-mono",
  weight: ["400", "500"],
});

export default async function CrmLayout({ children }: LayoutProps<"/crm">) {
  // Barrera de servidor: el layout nunca renderiza sin sesión de staff.
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  if (session.user.portalAudience === "portal" || !session.user.role) {
    redirect(session.user.portalAudience === "portal" ? "/portal" : "/login");
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
    <div className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
      <HeaderTitleProvider>
        <CrmShell
          brand={
            <Link
              href="/crm/dashboard"
              className="brand"
              aria-label="J&H MultiServices LLC — Inicio"
            >
              <span className="brand-mark">
                J<span>&</span>H
              </span>
              <span className="brand-tag">Multiservices LLC</span>
            </Link>
          }
          sidebar={
            <Suspense fallback={<div className="flex-1" aria-hidden />}>
              <SidebarNav />
            </Suspense>
          }
          header={
            <CrmHeader role={session.user.role ?? null}>
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
            </CrmHeader>
          }
        >
          <CrmMain>{children}</CrmMain>
        </CrmShell>
      </HeaderTitleProvider>
      <CrmChat />
    </div>
  );
}
