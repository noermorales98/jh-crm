import type { Metadata } from "next";
import { CuelumeProvider } from "@/src/components/cuelume/cuelume-provider";
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
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full">
        <CuelumeProvider>{children}</CuelumeProvider>
      </body>
    </html>
  );
}
