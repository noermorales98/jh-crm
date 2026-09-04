import { IBM_Plex_Mono, Space_Grotesk } from "next/font/google";

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

/** Fuentes de marca J&H para la página pública de intake. */
export default function IntakeLayout({ children }: LayoutProps<"/intake">) {
  return (
    <div className={`${spaceGrotesk.variable} ${ibmPlexMono.variable}`}>
      {children}
    </div>
  );
}
