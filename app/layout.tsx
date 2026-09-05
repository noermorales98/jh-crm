import type { Metadata, Viewport } from "next";
import { CuelumeProvider } from "@/src/components/cuelume/cuelume-provider";
import { ThemeProvider } from "@/src/components/theme/theme-provider";
import { THEME_INIT_SCRIPT } from "@/src/components/theme/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "J&H MultiServices LLC",
    template: "%s",
  },
  description:
    "J&H MultiServices LLC: formación de LLC, páginas web, consultoría personalizada y proyectos de negocio.",
  applicationName: "J&H CRM",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "J&H CRM",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f5fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a1f44" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeProvider>
          <CuelumeProvider>{children}</CuelumeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
