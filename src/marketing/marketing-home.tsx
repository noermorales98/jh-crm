"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ContactForm } from "./contact-form";
import "./landing.css";

const IMG = {
  hero: "https://images.unsplash.com/photo-1556761175-5973dc0f32e7?auto=format&fit=crop&w=2000&q=80",
  about: "https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1400&q=80",
  llc: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&w=900&q=80",
  web: "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80",
  consult: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=900&q=80",
  projects: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=900&q=80",
} as const;

export function MarketingHome() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 24);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const nodes = document.querySelectorAll(".jh-landing .reveal");
    if (prefersReduced || !("IntersectionObserver" in window)) {
      nodes.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    nodes.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <a className="skip-link" href="#contenido">
        Saltar al contenido principal
      </a>
      {menuOpen ? (
        <button
          type="button"
          className="nav-overlay"
          aria-label="Cerrar menú"
          onClick={closeMenu}
        />
      ) : null}

      <header className={scrolled || menuOpen ? "scrolled" : "on-hero"}>
        <div className="header-frost" aria-hidden="true" />
        <div className="wrap nav">
          <a className="brand" href="#inicio" aria-label="J&H MultiServices LLC — Inicio">
            <span className="brand-mark">
              J<span>&</span>H
            </span>
            <span className="brand-tag">MultiServices LLC</span>
          </a>
          <nav aria-label="Navegación principal">
            <ul id="menu-principal" className={menuOpen ? "nav-links open" : "nav-links"}>
              <li>
                <a href="#nosotros" onClick={closeMenu}>
                  Nosotros
                </a>
              </li>
              <li>
                <a href="#servicios" onClick={closeMenu}>
                  Servicios
                </a>
              </li>
              <li>
                <a href="#proceso" onClick={closeMenu}>
                  Proceso
                </a>
              </li>
              <li>
                <a href="#clientes" onClick={closeMenu}>
                  Clientes
                </a>
              </li>
              <li>
                <a href="#contacto" onClick={closeMenu}>
                  Contacto
                </a>
              </li>
              <li className="nav-mobile-cta">
                <a href="#inicio" className="btn btn-primary btn-sm" onClick={closeMenu}>
                  Consulta por $1
                </a>
              </li>
            </ul>
          </nav>
          <div className="nav-cta">
            <a className="nav-phone" href="tel:+18722020156" aria-label="Llamar al (872) 202-0156">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <span>(872) 202-0156</span>
            </a>
            <a className="btn btn-primary btn-sm nav-consult" href="#inicio">
              Consulta por $1
            </a>
            <button
              type="button"
              className={menuOpen ? "menu-btn open" : "menu-btn"}
              aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={menuOpen}
              aria-controls="menu-principal"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
              <span aria-hidden="true"></span>
            </button>
          </div>
        </div>
      </header>

      <div className="page-body">
        <main id="contenido">
          {/* HÉROE — form + foto (estilo NCA) */}
          <section className="hero" id="inicio">
            <div className="hero-media" aria-hidden="true">
              <div className="hero-media-abs">
                <Image
                  src={IMG.hero}
                  alt=""
                  fill
                  priority
                  sizes="100vw"
                  className="hero-photo"
                />
                <div className="hero-shade" />
              </div>
            </div>
            <div className="wrap hero-inner">
              <div className="hero-form-panel reveal">
                <ContactForm variant="hero" />
              </div>
              <div className="hero-copy">
                <p className="hero-welcome reveal d1">Reparación y análisis de crédito</p>
                <h1 className="reveal d2">
                  <span className="hero-brand">J&amp;H</span>
                  <span className="hero-headline">
                    Análisis crediticio, reparación de crédito y acompañamiento claro.
                  </span>
                </h1>
                <p className="hero-sub reveal d3">
                  Revisamos su reporte, explicamos su situación y le acompañamos en el proceso de
                  disputa — con una consulta inicial por solo $1 USD. Sin promesas de puntaje.
                </p>
                <a className="btn btn-ghost-light reveal d4" href="#servicios">
                  Ver servicios de crédito
                </a>
              </div>
            </div>
          </section>

          {/* BENEFICIOS */}
          <section className="benefits" aria-label="Beneficios">
            <div className="wrap benefits-grid">
              <article className="benefit reveal">
                <span className="benefit-num" aria-hidden="true">
                  01
                </span>
                <h3>Análisis de crédito</h3>
                <p>
                  Revisamos su reporte y le explicamos cuentas, burós y puntos críticos con lenguaje
                  claro.
                </p>
              </article>
              <article className="benefit reveal d1">
                <span className="benefit-num" aria-hidden="true">
                  02
                </span>
                <h3>Reparación guiada</h3>
                <p>
                  Acompañamiento en disputas y seguimiento de rondas, con un plan adaptado a su caso.
                </p>
              </article>
              <article className="benefit reveal d2">
                <span className="benefit-num" aria-hidden="true">
                  03
                </span>
                <h3>Educación crediticia</h3>
                <p>
                  Aprenda a leer su perfil y a tomar decisiones informadas. Los resultados dependen de
                  su situación y de los burós.
                </p>
              </article>
            </div>
          </section>

          {/* NOSOTROS */}
          <section id="nosotros">
            <div className="wrap about-layout">
              <div className="about-visual reveal">
                <Image
                  src={IMG.about}
                  alt="Asesoría profesional sobre análisis y reparación de crédito"
                  fill
                  sizes="(max-width: 1020px) 100vw, 40vw"
                  className="about-photo"
                />
              </div>
              <div className="about-body">
                <div className="sec-head reveal d1">
                  <div className="eyebrow">Acerca de nosotros</div>
                  <h2>Especialistas en crédito y acompañamiento personalizado</h2>
                </div>
                <p className="lead reveal d2">
                  J&amp;H MultiServices LLC se enfoca en{" "}
                  <strong>análisis crediticio, reparación de crédito y educación</strong> para que
                  comprenda su reporte y avance con un plan concreto — sin garantías de puntaje ni de
                  eliminación.
                </p>
                <p className="about-note reveal d2">
                  Su consulta inicial cuesta solo $1 USD: revisamos su situación, le explicamos el
                  panorama y, si encaja, diseñamos el siguiente paso (documentos, disputas y
                  seguimiento).
                </p>
                <div className="values reveal d3">
                  <div className="value">
                    <span className="value-num">01</span>
                    <h3>Análisis</h3>
                    <p>Leemos su reporte con usted y priorizamos lo que realmente importa.</p>
                  </div>
                  <div className="value">
                    <span className="value-num">02</span>
                    <h3>Reparación</h3>
                    <p>Proceso de disputa ordenado, con seguimiento de cada ronda.</p>
                  </div>
                  <div className="value">
                    <span className="value-num">03</span>
                    <h3>Claridad</h3>
                    <p>Educación crediticia y comunicación cercana en cada etapa.</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SERVICIOS */}
          <section className="services" id="servicios">
            <div className="wrap">
              <div className="sec-head reveal">
                <div className="eyebrow">Nuestros servicios</div>
                <h2>Crédito primero: análisis, reparación y seguimiento</h2>
                <p>
                  Nuestro foco es su perfil crediticio. También ofrecemos LLC y presencia web cuando
                  su proyecto lo necesita.
                </p>
              </div>
              <div className="svc-grid">
                <article className="svc reveal">
                  <div className="svc-media">
                    <Image
                      src={IMG.consult}
                      alt="Consultora revisando información crediticia con un cliente"
                      width={640}
                      height={420}
                      sizes="(max-width: 760px) 100vw, 50vw"
                    />
                  </div>
                  <span className="svc-num">01</span>
                  <h3>Análisis de crédito</h3>
                  <p>
                    Revisión de su reporte (Experian, Equifax, TransUnion): cuentas, puntajes e
                    ítems a vigilar — explicados en lenguaje claro.
                  </p>
                </article>
                <article className="svc reveal d1">
                  <div className="svc-media">
                    <Image
                      src={IMG.projects}
                      alt="Equipo trabajando en el seguimiento de un caso de crédito"
                      width={640}
                      height={420}
                      sizes="(max-width: 760px) 100vw, 50vw"
                    />
                  </div>
                  <span className="svc-num">02</span>
                  <h3>Reparación de crédito</h3>
                  <p>
                    Acompañamiento en disputas ante burós y acreedores, con rondas ordenadas y
                    seguimiento continuo. Sin garantías de eliminación ni de puntaje.
                  </p>
                </article>
                <article className="svc reveal d2">
                  <div className="svc-media">
                    <Image
                      src={IMG.llc}
                      alt="Documentos educativos sobre crédito y finanzas personales"
                      width={640}
                      height={420}
                      sizes="(max-width: 760px) 100vw, 50vw"
                    />
                  </div>
                  <span className="svc-num">03</span>
                  <h3>Educación crediticia</h3>
                  <p>
                    Aprenda a leer su reporte, priorizar deudas y sostener buenos hábitos. El
                    progreso depende de su situación y de terceros.
                  </p>
                </article>
                <article className="svc reveal d3">
                  <div className="svc-media">
                    <Image
                      src={IMG.web}
                      alt="Servicios complementarios de negocio y presencia digital"
                      width={640}
                      height={420}
                      sizes="(max-width: 760px) 100vw, 50vw"
                    />
                  </div>
                  <span className="svc-num">04</span>
                  <h3>LLC y presencia web</h3>
                  <p>
                    Si además necesita estructurar su negocio o una web profesional, lo
                    acompañamos como servicio complementario.
                  </p>
                </article>
              </div>
            </div>
          </section>

          {/* PROCESO — Cómo funciona */}
          <section className="process" id="proceso">
            <div className="wrap">
              <div className="sec-head reveal">
                <div className="eyebrow">Cómo funciona</div>
                <h2>De la consulta al seguimiento de su crédito</h2>
                <p>
                  Un proceso claro para analizar su reporte y avanzar en la reparación, sin
                  promesas de resultados.
                </p>
              </div>
              <ol className="process-steps">
                <li className="reveal">
                  <span className="step-num">01</span>
                  <h3>Consulta inicial</h3>
                  <p>
                    Por $1 USD escuchamos su caso y le damos una primera orientación sobre análisis
                    y reparación de crédito.
                  </p>
                </li>
                <li className="reveal d1">
                  <span className="step-num">02</span>
                  <h3>Análisis del reporte</h3>
                  <p>
                    Revisamos su información crediticia (cuentas, burós, ítems negativos) para
                    entender el panorama con usted.
                  </p>
                </li>
                <li className="reveal d2">
                  <span className="step-num">03</span>
                  <h3>Plan de reparación</h3>
                  <p>
                    Definimos un plan personalizado: documentos, disputas y prioridades según su
                    situación real.
                  </p>
                </li>
                <li className="reveal d3">
                  <span className="step-num">04</span>
                  <h3>Seguimiento</h3>
                  <p>
                    Acompañamos cada ronda con comunicación clara. Los resultados dependen de su
                    caso y de los burós; no garantizamos plazos ni puntajes.
                  </p>
                </li>
              </ol>
              <div className="process-cta reveal d3">
                <a className="btn btn-primary" href="#inicio">
                  Solicitar consulta por $1
                </a>
              </div>
            </div>
          </section>

          {/* CLIENTES */}
          <section id="clientes">
            <div className="wrap">
              <div className="sec-head reveal">
                <div className="eyebrow">Nuestros clientes</div>
                <h2>Personas que buscan claridad en su crédito</h2>
                <p>
                  Acompañamos a quienes quieren entender su reporte y avanzar en un proceso de
                  reparación responsable.
                </p>
              </div>
              <div className="clients-grid">
                <article className="client reveal">
                  <h3>Quienes revisan su reporte</h3>
                  <p>
                    Personas que necesitan un análisis claro de cuentas, burós y próximos pasos.
                  </p>
                </article>
                <article className="client reveal d1">
                  <h3>Proceso de reparación</h3>
                  <p>
                    Clientes que buscan acompañamiento en disputas y seguimiento de rondas, sin
                    promesas vacías.
                  </p>
                </article>
                <article className="client reveal d2">
                  <h3>Por recomendación</h3>
                  <p>
                    Quienes llegan referidos por alguien que ya trabajó con nosotros en su caso de
                    crédito.
                  </p>
                </article>
              </div>
              <blockquote className="clients-quote reveal">
                <p>
                  «Nuestro compromiso es{" "}
                  <em>analizar, educar y acompañar</em> — con profesionalismo y sin garantías
                  irreales de puntaje.»
                </p>
              </blockquote>
            </div>
          </section>

          {/* CONTACTO */}
          <section id="contacto">
            <div className="wrap">
              <div className="sec-head reveal">
                <div className="eyebrow">Contacto</div>
                <h2>Empiece su análisis de crédito</h2>
                <p>
                  Solicite la consulta por $1 USD o llámenos. Le explicaremos cómo trabajamos el
                  análisis y la reparación.
                </p>
              </div>
              <div className="contact-grid">
                <div className="reveal">
                  <p className="contact-big">
                    Llámenos hoy:
                    <br />
                    <a href="tel:+18722020156">(872) 202-0156</a>
                  </p>
                  <div className="contact-list">
                    <div className="contact-item">
                      <div className="ci" aria-hidden="true">
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <path d="M22 6l-10 7L2 6" />
                        </svg>
                      </div>
                      <div>
                        <b>Correo electrónico</b>
                        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>
                      </div>
                    </div>
                    <div className="contact-item">
                      <div className="ci" aria-hidden="true">
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                        </svg>
                      </div>
                      <div>
                        <b>Teléfono</b>
                        <a href="tel:+18722020156">(872) 202-0156</a>
                      </div>
                    </div>
                    <div className="contact-item">
                      <div className="ci" aria-hidden="true">
                        <svg
                          width="22"
                          height="22"
                          viewBox="0 0 24 24"
                          fill="none"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 6v6l4 2" />
                        </svg>
                      </div>
                      <div>
                        <b>Consulta inicial</b>
                        <span className="v">$1 USD</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="contact-card reveal d1">
                  <ContactForm variant="full" />
                  <div className="contact-hours">
                    <span className="dot-live" aria-hidden="true"></span>
                    Disponibles para atenderle
                  </div>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer>
          <div className="wrap">
            <div className="foot-grid">
              <div className="foot-brand">
                <span className="brand-mark">
                  J<span>&</span>H
                </span>
                <p>
                  Análisis crediticio, reparación de crédito y educación — con consulta inicial por
                  $1 USD. Sin garantías de puntaje.
                </p>
              </div>
              <div className="foot-col">
                <b>Navegación</b>
                <a href="#nosotros">Nosotros</a>
                <a href="#servicios">Servicios</a>
                <a href="#proceso">Proceso</a>
                <a href="#clientes">Clientes</a>
                <a href="#contacto">Contacto</a>
              </div>
              <div className="foot-col">
                <b>Legal</b>
                <a href="/privacy">Privacidad</a>
                <a href="/terms">Términos</a>
                <a href="/cancellation">Cancelación</a>
                <a href="/refunds">Reembolsos</a>
                <a href="/disclosures">Divulgaciones</a>
                <a href="/sms-terms">Términos SMS</a>
              </div>
              <div className="foot-col">
                <b>Contacto</b>
                <a href="tel:+18722020156">(872) 202-0156</a>
                <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>
                <a href="https://jh-multiservices.com/" target="_blank" rel="noopener">
                  jh-multiservices.com
                </a>
              </div>
            </div>
            <div className="foot-bottom">
              <span>© 2026 J&amp;H MultiServices LLC. Todos los derechos reservados.</span>
              <span>«Trabajemos juntos»</span>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
