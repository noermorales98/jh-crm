import Link from "next/link";
import "./landing.css";
import "./legal.css";

const LEGAL_LINKS = [
  { href: "/privacy", label: "Privacidad" },
  { href: "/terms", label: "Términos" },
  { href: "/cancellation", label: "Cancelación" },
  { href: "/refunds", label: "Reembolsos" },
  { href: "/disclosures", label: "Divulgaciones" },
  { href: "/sms-terms", label: "SMS" },
] as const;

type LegalShellProps = {
  title: string;
  children: React.ReactNode;
};

export function LegalShell({ title, children }: LegalShellProps) {
  return (
    <div className="jh-landing jh-legal">
      <header className="scrolled legal-header">
        <div className="wrap nav">
          <Link className="brand" href="/" aria-label="J&H MultiServices LLC — Inicio">
            <span className="brand-mark">
              J<span>&</span>H
            </span>
            <span className="brand-tag">MultiServices LLC</span>
          </Link>
          <nav aria-label="Volver">
            <Link className="btn btn-primary btn-sm" href="/">
              Inicio
            </Link>
          </nav>
        </div>
      </header>

      <div className="page-body">
        <main id="contenido" className="legal-main wrap">
          <p className="legal-draft-banner" role="note">
            Plantilla / borrador — requiere revisión legal. No constituye asesoría
            jurídica definitiva.
          </p>
          <div className="sec-head">
            <div className="eyebrow">J&amp;H Multiservices LLC</div>
            <h1>{title}</h1>
          </div>
          <article className="legal-prose">{children}</article>
        </main>

        <footer>
          <div className="wrap">
            <div className="foot-grid">
              <div className="foot-brand">
                <span className="brand-mark">
                  J<span>&</span>H
                </span>
                <p>
                  Documentos informativos del sitio. Consulte a un profesional
                  legal para su caso particular.
                </p>
              </div>
              <div className="foot-col">
                <b>Legal</b>
                {LEGAL_LINKS.map((link) => (
                  <Link key={link.href} href={link.href}>
                    {link.label}
                  </Link>
                ))}
              </div>
              <div className="foot-col">
                <b>Contacto</b>
                <a href="tel:+18722020156">(872) 202-0156</a>
                <a href="mailto:jhmultiservices10@gmail.com">
                  jhmultiservices10@gmail.com
                </a>
                <Link href="/">Volver al inicio</Link>
              </div>
            </div>
            <div className="foot-bottom">
              <span>© 2026 J&amp;H Multiservices LLC. Todos los derechos reservados.</span>
              <span>Plantillas — revisión legal pendiente</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
