import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans, IBM_Plex_Mono, Newsreader } from "next/font/google";
import { BrandLockup } from "@/src/components/brand/brand-lockup";
import { ContactForm } from "@/src/marketing/contact-form";
import { readPublicOrganizationIdFromEnv } from "@/src/server/contact";
import { getBrandContact } from "@/src/server/config/brand-contact";
import { normalizeBookingUrl, whatsappLink } from "@/src/lib/brand/contact-links";
import "@/src/marketing/landing.css";
import "@/src/marketing/capture.css";

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
  title: "Revisa tu crédito · J&H MultiServices LLC",
  description:
    "Déjanos tus datos y un asesor revisa tu reporte de crédito contigo. Sin promesas de puntaje.",
};

export const dynamic = "force-dynamic";

const STEPS = [
  { title: "Nos dejas tus datos", detail: "Toma un minuto." },
  { title: "Revisamos tu reporte", detail: "Equifax, Experian y TransUnion, cuenta por cuenta." },
  { title: "Te damos un plan por escrito", detail: "Qué se puede disputar y qué conviene pagar primero." },
];

async function readContact() {
  const orgId = readPublicOrganizationIdFromEnv();
  if (!orgId) return { whatsapp: null, booking: null };
  try {
    const contact = await getBrandContact(orgId);
    return {
      whatsapp: whatsappLink(contact.whatsappNumber, "Hola, quiero revisar mi crédito"),
      booking: normalizeBookingUrl(contact.bookingUrl),
    };
  } catch {
    return { whatsapp: null, booking: null };
  }
}

/**
 * Página de captación: corta y enfocada en un solo paso (dejar datos).
 * Usa el mismo formulario y API que `/`; el canal llega por UTM.
 */
export default async function CapturePage() {
  const { whatsapp, booking } = await readContact();

  return (
    <div className={`jh-landing ${newsreader.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}>
      <div className="jh-capture">
        <header className="capture-header wrap">
          <Link href="/" className="brand" aria-label="J&H Multiservices LLC, inicio">
            <BrandLockup priority />
          </Link>
        </header>

        <main className="capture-main wrap">
          <section className="capture-copy">
            <p className="capture-eyebrow">Reparación de crédito</p>
            <h1 className="capture-title">Descubre qué está bajando tu crédito y cómo corregirlo.</h1>
            <p className="capture-sub">
              Un asesor revisa tu caso contigo y te explica el siguiente paso. Sin compromiso.
            </p>

            <ol className="capture-steps">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className="capture-step-n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    <strong>{step.title}</strong>
                    <span className="capture-step-detail">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>

            {whatsapp || booking ? (
              <p className="capture-alt">
                ¿Prefieres hablar primero?{" "}
                {whatsapp ? (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    Escríbenos por WhatsApp
                  </a>
                ) : null}
                {whatsapp && booking ? " o " : null}
                {booking ? (
                  <a href={booking} target="_blank" rel="noopener noreferrer">
                    agenda una llamada
                  </a>
                ) : null}
                .
              </p>
            ) : null}
          </section>

          <section className="capture-form" aria-label="Formulario de contacto">
            <ContactForm variant="hero" />
          </section>
        </main>

        <footer className="capture-footer wrap">
          <p>
            No prometemos puntajes ni resultados. Solo disputamos información inexacta o que no se puede
            verificar, como permite la ley (FCRA). Puedes disputar por tu cuenta sin costo.
          </p>
          <nav aria-label="Legal" className="capture-legal">
            <a href="/privacy">Privacidad</a>
            <a href="/terms">Términos</a>
            <a href="/disclosures">Divulgaciones</a>
            <a href="/cancellation">Cancelación</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
