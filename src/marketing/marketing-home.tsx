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
                <p className="hero-welcome reveal d1">Bienvenido a J&amp;H MultiServices</p>
                <h1 className="reveal d2">
                  <span className="hero-brand">J&amp;H</span>
                  <span className="hero-headline">Su futuro financiero, en buenas manos.</span>
                </h1>
                <p className="hero-sub reveal d3">
                  Consultoría profesional con orientación personalizada, soluciones prácticas y una
                  consulta inicial por solo $1 USD.
                </p>
                <a className="btn btn-ghost-light reveal d4" href="#servicios">
                  Ver servicios
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
                <h3>Claridad financiera</h3>
                <p>Ordene su situación y tome decisiones con información clara y cercana.</p>
              </article>
              <article className="benefit reveal d1">
                <span className="benefit-num" aria-hidden="true">
                  02
                </span>
                <h3>Estructura de negocio</h3>
                <p>Forme su LLC y organice su proyecto con pasos seguros y sin complicaciones.</p>
              </article>
              <article className="benefit reveal d2">
                <span className="benefit-num" aria-hidden="true">
                  03
                </span>
                <h3>Presencia profesional</h3>
                <p>Una web moderna y servicios a medida para que su marca inspire confianza.</p>
              </article>
            </div>
          </section>

          {/* NOSOTROS */}
          <section id="nosotros">
            <div className="wrap about-layout">
              <div className="about-visual reveal">
                <Image
                  src={IMG.about}
                  alt="Equipo profesional en reunión de consultoría"
                  fill
                  sizes="(max-width: 1020px) 100vw, 40vw"
                  className="about-photo"
                />
              </div>
              <div className="about-body">
                <div className="sec-head reveal d1">
                  <div className="eyebrow">Acerca de nosotros</div>
                  <h2>Orientación clara para decisiones informadas</h2>
                </div>
                <p className="lead reveal d2">
                  J&amp;H MultiServices LLC ofrece servicios de consultoría diseñados para ayudarle a{" "}
                  <strong>comprender mejor su situación financiera</strong> y tomar decisiones
                  informadas con total tranquilidad.
                </p>
                <p className="about-note reveal d2">
                  Nos enfocamos en orientación personalizada y soluciones prácticas adaptadas a cada
                  cliente. Su consulta inicial cuesta solo $1 USD: un punto de partida accesible para
                  conocer su caso y trazar un plan.
                </p>
                <div className="values reveal d3">
                  <div className="value">
                    <span className="value-num">01</span>
                    <h3>Experiencia</h3>
                    <p>Trayectoria brindando servicios confiables a quienes más lo necesitan.</p>
                  </div>
                  <div className="value">
                    <span className="value-num">02</span>
                    <h3>Compromiso</h3>
                    <p>Cada cliente recibe dedicación completa, del primer contacto al resultado.</p>
                  </div>
                  <div className="value">
                    <span className="value-num">03</span>
                    <h3>Valor</h3>
                    <p>Soluciones prácticas que generan un beneficio real y medible para usted.</p>
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
                <h2>Todo lo que su proyecto necesita, en un solo lugar</h2>
                <p>Cuatro áreas de especialización, un mismo nivel de dedicación.</p>
              </div>
              <div className="svc-grid">
                <article className="svc reveal">
                  <div className="svc-media">
                    <Image
                      src={IMG.llc}
                      alt="Documentos de formación de empresa sobre un escritorio"
                      width={640}
                      height={420}
                      sizes="(max-width: 760px) 100vw, 50vw"
                    />
                  </div>
                  <span className="svc-num">01</span>
                  <h3>Formación de LLC</h3>
                  <p>
                    Le ayudamos a registrar su negocio de manera fácil y segura, paso a paso y sin
                    complicaciones.
                  </p>
                </article>
                <article className="svc reveal d1">
                  <div className="svc-media">
                    <Image
                      src={IMG.web}
                      alt="Diseño de página web en una laptop"
                      width={640}
                      height={420}
                      sizes="(max-width: 760px) 100vw, 50vw"
                    />
                  </div>
                  <span className="svc-num">02</span>
                  <h3>Páginas Web</h3>
                  <p>
                    Creamos su presencia profesional en internet: moderna, clara y lista para captar
                    clientes.
                  </p>
                </article>
                <article className="svc reveal d2">
                  <div className="svc-media">
                    <Image
                      src={IMG.consult}
                      alt="Consultora escuchando a un cliente"
                      width={640}
                      height={420}
                      sizes="(max-width: 760px) 100vw, 50vw"
                    />
                  </div>
                  <span className="svc-num">03</span>
                  <h3>Consultoría Personalizada</h3>
                  <p>
                    Asesoría adaptada a sus necesidades específicas, con acompañamiento cercano y
                    profesional.
                  </p>
                </article>
                <article className="svc reveal d3">
                  <div className="svc-media">
                    <Image
                      src={IMG.projects}
                      alt="Equipo colaborando en un proyecto de negocio"
                      width={640}
                      height={420}
                      sizes="(max-width: 760px) 100vw, 50vw"
                    />
                  </div>
                  <span className="svc-num">04</span>
                  <h3>Proyectos Personales y de Negocio</h3>
                  <p>
                    Convertimos sus ideas en realidad: planificación, ejecución y seguimiento de
                    principio a fin.
                  </p>
                </article>
              </div>
            </div>
          </section>

          {/* PROCESO */}
          <section className="process" id="proceso">
            <div className="wrap">
              <div className="sec-head reveal">
                <div className="eyebrow">Cómo lo hacemos</div>
                <h2>Nuestro proceso en 3 pasos</h2>
                <p>De la primera consulta al resultado, con claridad en cada etapa.</p>
              </div>
              <ol className="process-steps">
                <li className="reveal">
                  <span className="step-num">01</span>
                  <h3>Consulta por $1</h3>
                  <p>
                    Cuéntenos su situación. Por solo $1 USD revisamos su caso y le ofrecemos una
                    primera orientación concreta.
                  </p>
                </li>
                <li className="reveal d1">
                  <span className="step-num">02</span>
                  <h3>Plan personalizado</h3>
                  <p>
                    Diseñamos un plan de acción adaptado a sus metas: LLC, web, consultoría o
                    proyecto a medida.
                  </p>
                </li>
                <li className="reveal d2">
                  <span className="step-num">03</span>
                  <h3>Ejecución y seguimiento</h3>
                  <p>
                    Avanzamos juntos con comunicación clara, plazos definidos y acompañamiento hasta
                    el resultado.
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
                <h2>Una empresa elegida por quienes valoran el profesionalismo</h2>
                <p>Hemos proporcionado servicios confiables desde el inicio de nuestras operaciones.</p>
              </div>
              <div className="clients-grid">
                <article className="client reveal">
                  <h3>Clientes individuales</h3>
                  <p>
                    Personas que buscan ordenar sus finanzas y alcanzar sus metas con acompañamiento
                    experto.
                  </p>
                </article>
                <article className="client reveal d1">
                  <h3>Servicios profesionales</h3>
                  <p>
                    Profesionales y negocios que confían en nosotros para estructurar y hacer crecer
                    sus proyectos.
                  </p>
                </article>
                <article className="client reveal d2">
                  <h3>Clientes por referencia</h3>
                  <p>
                    La mayor prueba de confianza: clientes que llegan recomendados por quienes ya
                    trabajaron con nosotros.
                  </p>
                </article>
              </div>
              <blockquote className="clients-quote reveal">
                <p>
                  «Nos sentimos orgullosos de ser una empresa elegida por diferentes clientes que
                  valoran nuestro <em>profesionalismo y dedicación</em>.»
                </p>
              </blockquote>
            </div>
          </section>

          {/* CONTACTO */}
          <section id="contacto">
            <div className="wrap">
              <div className="sec-head reveal">
                <div className="eyebrow">Contacto</div>
                <h2>Trabajemos juntos</h2>
                <p>Estamos listos para escucharle. Comuníquese con nosotros por el medio que prefiera.</p>
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
                  Consultoría y servicios profesionales con experiencia, compromiso y valor. Consulta
                  inicial por $1 USD.
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
