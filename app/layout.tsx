import type { Metadata } from "next";
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
