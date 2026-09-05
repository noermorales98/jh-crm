import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { MarketingHome } from "@/src/marketing/marketing-home";

const newsreader = Newsreader({
  subsets: ["latin"],
  variable: "--font-jh-display",
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-jh-body",
  weight: ["400", "500", "600", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-jh-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "J&H MultiServices LLC — Análisis y reparación de crédito",
  description:
    "Análisis crediticio, reparación de crédito y educación. Consulta inicial por $1 USD. Sin promesas de puntaje. J&H MultiServices LLC.",
};

export default function HomePage() {
  return (
    <div
      className={`jh-landing ${newsreader.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}
    >
      <MarketingHome />
    </div>
  );
}
