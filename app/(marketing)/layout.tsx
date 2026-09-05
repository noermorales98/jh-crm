import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Newsreader } from "next/font/google";

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
  title: {
    template: "%s — J&H Multiservices LLC",
    default: "Legal — J&H Multiservices LLC",
  },
  robots: { index: true, follow: true },
};

export default function MarketingLegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className={`${newsreader.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}
    >
      {children}
    </div>
  );
}
