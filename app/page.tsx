import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter, Space_Grotesk } from "next/font/google";
import { MarketingHome } from "@/src/marketing/marketing-home";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-jh-display",
  weight: ["500", "600", "700"],
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-jh-body",
  weight: ["400", "500", "600"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-jh-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "J&H MultiServices LLC — Consultoría y Servicios de Confianza",
  description:
    "J&H MultiServices LLC: formación de LLC, páginas web, consultoría personalizada y proyectos de negocio. Experiencia, compromiso y valor.",
};

export default function HomePage() {
  return (
    <div
      className={`jh-landing ${spaceGrotesk.variable} ${inter.variable} ${ibmPlexMono.variable}`}
    >
      <MarketingHome />
    </div>
  );
}
