"use client";

import { useEffect, useState } from "react";
import { ContactForm } from "./contact-form";
import "./landing.css";

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
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
    );
    nodes.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
<a className="skip-link" href="#contenido">Saltar al contenido principal</a>
<div className="page">
{menuOpen ? (
  <button
    type="button"
    className="nav-overlay"
    aria-label="Cerrar menú"
    onClick={closeMenu}
  />
) : null}

{/*  ============ CABECERA ============  */}
<header className={scrolled ? "scrolled" : undefined}>
  <div className="wrap nav">
    <a className="brand" href="#inicio" aria-label="J&H MultiServices LLC — Inicio">
      <span className="brand-mark">J<span>&</span>H</span>
      <span className="brand-tag">MultiServices LLC</span>
    </a>
    <nav aria-label="Navegación principal">
      <ul id="menu-principal" className={menuOpen ? "nav-links open" : "nav-links"}>
        <li><a href="#nosotros" onClick={closeMenu}>Nosotros</a></li>
        <li><a href="#servicios" onClick={closeMenu}>Servicios</a></li>
        <li><a href="#clientes" onClick={closeMenu}>Clientes</a></li>
        <li><a href="#fundador" onClick={closeMenu}>Fundador</a></li>
        <li><a href="#contacto" onClick={closeMenu}>Contacto</a></li>
      </ul>
    </nav>
    <div className="nav-cta">
      <a className="nav-phone" href="tel:+18722020156" aria-label="Llamar al (872) 202-0156">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1570EF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span>(872) 202-0156</span>
      </a>
      <button type="button" className={menuOpen ? "menu-btn open" : "menu-btn"} aria-label={menuOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuOpen} aria-controls="menu-principal" onClick={() => setMenuOpen((v) => !v)}>
        <span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>
      </button>
    </div>
  </div>
</header>

<main id="contenido">
{/*  ============ HÉROE ============  */}
<section className="hero" id="inicio">
  <div className="hero-bg">
    <div className="hero-grid"></div>
    <div className="hero-glow"></div>
  </div>
  <div className="wrap hero-inner">
    <div>
      <span className="hero-badge reveal"><span className="dot-live" aria-hidden={true}></span> Atendiendo nuevos clientes</span>
      <h1 className="reveal d1">
        Su futuro financiero,<br />
        <span className="accent">en buenas manos.
          <svg viewBox="0 0 220 14" preserveAspectRatio="none" aria-hidden={true}><path d="M4 10 C 60 3, 160 3, 216 8"/></svg>
        </span>
      </h1>
      <p className="hero-sub reveal d2">
        Consultoría financiera y servicios profesionales con orientación personalizada,
        soluciones prácticas y el trato cercano que usted merece.
      </p>
      <div className="hero-actions reveal d3">
        <a className="btn btn-primary" href="#contacto">
          Trabajemos juntos
          <svg className="arrow" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
        <a className="btn btn-ghost" href="#servicios">Ver servicios</a>
      </div>
      <div className="hero-trust reveal d4">
        <div className="avatars" aria-hidden={true}>
          <span style={{background: "linear-gradient(140deg,#1570EF,#0B3D91)"}}>MG</span>
          <span style={{background: "linear-gradient(140deg,#3D8BFD,#1570EF)"}}>JR</span>
          <span style={{background: "linear-gradient(140deg,#6FA8FF,#1570EF)"}}>AL</span>
          <span style={{background: "linear-gradient(140deg,#6FA8FF,#1570EF)"}}>+</span>
        </div>
        <p>
          <svg className="star" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden={true}><path d="M12 2l3 6 7 .8-5.2 4.7 1.5 6.9L12 17l-6.3 3.4 1.5-6.9L2 8.8 9 8z"/></svg>
          <b>Clientes que confían</b> en nuestro trabajo desde el inicio de operaciones.
        </p>
      </div>
    </div>
    <div className="hero-visual reveal d3">
      <div className="hero-ring" aria-hidden={true}></div>
      <div className="float-chip fc-note">
        <span className="fc-avatar" aria-hidden={true}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
        </span>
        <div><b>¡Bienvenido!</b><small>Su consulta es atendida de inmediato</small></div>
      </div>
      <div className="float-chip fc-stat">
        <div className="row"><b>Su proyecto</b><span className="fc-pill">En progreso</span></div>
        <svg width="132" height="34" viewBox="0 0 132 34" fill="none" aria-hidden={true}>
          <path d="M2 28 C 20 26, 28 18, 44 20 S 70 10, 86 12 S 116 4, 130 5" stroke="#1570EF" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="130" cy="5" r="3.5" fill="#1570EF"/>
        </svg>
        <small>Avance constante, paso a paso</small>
      </div>
      <div className="hero-card" role="img" aria-label="Ilustración del crecimiento constante de nuestros clientes">
        <div className="hero-card-top">
          <span>Confianza construida</span>
          <span>Desde el día uno</span>
        </div>
        <div className="hero-num">100<small>%</small></div>
        <p>Compromiso con cada cliente, en cada proyecto, desde el inicio de nuestras operaciones.</p>
        <div className="hero-bars" aria-hidden={true}><i></i><i></i><i></i><i></i><i></i><i></i></div>
      </div>
      <div className="hero-chip">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1570EF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>
        Servicio confiable y seguro
      </div>
    </div>
  </div>
</section>

{/*  ============ CIFRAS ============  */}
<div className="stats">
  <div className="wrap stats-grid">
    <div className="stat reveal"><b>4</b><span>Servicios especializados</span></div>
    <div className="stat reveal d1"><b>3</b><span>Tipos de clientes atendidos</span></div>
    <div className="stat reveal d2"><b>1<em>:</em>1</b><span>Atención personalizada</span></div>
  </div>
</div>

{/*  ============ NOSOTROS ============  */}
<section id="nosotros">
  <div className="wrap">
    <div className="sec-head reveal">
      <div className="eyebrow">Acerca de nosotros</div>
      <h2>Orientación clara para decisiones informadas</h2>
    </div>
    <div className="about-cols">
      <div className="reveal">
        <p className="lead">
          J&H MultiServices LLC ofrece servicios de consultoría diseñados para ayudarle a
          <strong>comprender mejor su situación financiera</strong> y tomar decisiones informadas
          con total tranquilidad.
        </p>
        <div className="about-note">
          Nos enfocamos en brindar orientación personalizada y soluciones prácticas adaptadas a
          las necesidades de cada cliente. Sus preguntas y comentarios son siempre bienvenidos:
          trabajamos para servirle mejor cada día.
        </div>
      </div>
      <div className="values reveal d1">
        <div className="value">
          <span className="value-num">01</span>
          <h3>Experiencia</h3>
          <p>Años de trayectoria brindando servicios confiables a quienes más lo necesitan.</p>
        </div>
        <div className="value">
          <span className="value-num">02</span>
          <h3>Compromiso</h3>
          <p>Cada cliente recibe dedicación completa, del primer contacto al resultado final.</p>
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

{/*  ============ SERVICIOS ============  */}
<section className="services" id="servicios">
  <div className="wrap">
    <div className="sec-head reveal">
      <div className="eyebrow">Nuestros servicios</div>
      <h2>Todo lo que su proyecto necesita, en un solo lugar</h2>
      <p>Cuatro áreas de especialización, un mismo nivel de dedicación.</p>
    </div>
    <div className="svc-list">
      <article className="svc reveal">
        <span className="svc-num">01</span>
        <div>
          <h3>Formación de LLC</h3>
          <p>Le ayudamos a registrar su negocio de manera fácil y segura, paso a paso y sin complicaciones.</p>
        </div>
        <div className="svc-icon" aria-hidden={true}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/></svg>
        </div>
      </article>
      <article className="svc reveal d1">
        <span className="svc-num">02</span>
        <div>
          <h3>Páginas Web</h3>
          <p>Creamos su presencia profesional en internet: moderna, clara y lista para captar clientes.</p>
        </div>
        <div className="svc-icon" aria-hidden={true}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18M8 21h8"/></svg>
        </div>
      </article>
      <article className="svc reveal d2">
        <span className="svc-num">03</span>
        <div>
          <h3>Consultoría Personalizada General</h3>
          <p>Asesoría adaptada a sus necesidades específicas, con acompañamiento cercano y profesional.</p>
        </div>
        <div className="svc-icon" aria-hidden={true}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
      </article>
      <article className="svc reveal d3">
        <span className="svc-num">04</span>
        <div>
          <h3>Proyectos Personales y de Negocio</h3>
          <p>Convertimos sus ideas en realidad: planificación, ejecución y seguimiento de principio a fin.</p>
        </div>
        <div className="svc-icon" aria-hidden={true}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l3 6 7 .8-5.2 4.7 1.5 6.9L12 17l-6.3 3.4 1.5-6.9L2 8.8 9 8z"/></svg>
        </div>
      </article>
    </div>
  </div>
</section>

{/*  ============ CLIENTES ============  */}
<section id="clientes">
  <div className="wrap">
    <div className="sec-head reveal">
      <div className="eyebrow">Nuestros clientes</div>
      <h2>Una empresa elegida por quienes valoran el profesionalismo</h2>
      <p>Hemos proporcionado servicios confiables desde el inicio de nuestras operaciones.</p>
    </div>
    <div className="clients-grid">
      <article className="client reveal">
        <div className="c-icon" aria-hidden={true}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/></svg>
        </div>
        <h3>Clientes individuales</h3>
        <p>Personas que buscan ordenar sus finanzas y alcanzar sus metas con acompañamiento experto.</p>
      </article>
      <article className="client reveal d1">
        <div className="c-icon" aria-hidden={true}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/></svg>
        </div>
        <h3>Servicios profesionales</h3>
        <p>Profesionales y negocios que confían en nosotros para estructurar y hacer crecer sus proyectos.</p>
      </article>
      <article className="client reveal d2">
        <div className="c-icon" aria-hidden={true}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <h3>Clientes por referencia</h3>
        <p>La mayor prueba de confianza: clientes que llegan recomendados por quienes ya trabajaron con nosotros.</p>
      </article>
    </div>
    <div className="clients-quote reveal">
      <p>«Nos sentimos orgullosos de ser una empresa elegida por diferentes clientes que valoran nuestro <em>profesionalismo y dedicación</em>.»</p>
    </div>
  </div>
</section>

{/*  ============ FUNDADOR ============  */}
<section className="founder" id="fundador">
  <div className="wrap founder-grid">
    <div className="founder-figure reveal" role="img" aria-label="Monograma de Hugo Montenegro, fundador de J&H MultiServices LLC">
      <span className="founder-initials">H<span>M</span></span>
      <span className="founder-badge">Fundador</span>
    </div>
    <div className="founder-txt reveal d1">
      <div className="eyebrow">Nuestro fundador</div>
      <h2>Detrás de cada resultado, una persona comprometida</h2>
      <p>
        Hugo Montenegro fundó J&H MultiServices LLC con una convicción sencilla: cada cliente
        merece orientación honesta, clara y adaptada a su realidad. Esa filosofía guía cada
        proyecto que emprendemos.
      </p>
      <p>
        Bajo su dirección, la empresa ha construido una reputación basada en la experiencia,
        el compromiso y el valor — los tres pilares que sostienen cada servicio que ofrecemos.
      </p>
      <div className="founder-sign">
        <span className="line" aria-hidden={true}></span>
        <div>
          <b>Hugo Montenegro</b>
          <small>Fundador — J&H MultiServices LLC</small>
        </div>
      </div>
    </div>
  </div>
</section>

{/*  ============ CONTACTO ============  */}
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
          Llámenos hoy:<br />
          <a href="tel:+18722020156">(872) 202-0156</a>
        </p>
        <div className="contact-list">
          <div className="contact-item">
            <div className="ci" aria-hidden={true}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="M22 6l-10 7L2 6"/></svg>
            </div>
            <div>
              <b>Correo electrónico</b>
              <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>
            </div>
          </div>
          <div className="contact-item">
            <div className="ci" aria-hidden={true}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            </div>
            <div>
              <b>Página web</b>
              <a href="https://jh-multiservices.com/" target="_blank" rel="noopener">jh-multiservices.com</a>
            </div>
          </div>
          <div className="contact-item">
            <div className="ci" aria-hidden={true}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            </div>
            <div>
              <b>Teléfono</b>
              <a href="tel:+18722020156">(872) 202-0156</a>
            </div>
          </div>
        </div>
      </div>
      <div className="contact-card reveal d1">
        <ContactForm />
        <div className="contact-hours">
          <span className="dot-live" aria-hidden={true}></span>
          Disponibles para atenderle
        </div>
      </div>
    </div>
  </div>
</section>
</main>

{/*  ============ PIE ============  */}
<footer>
  <div className="wrap">
    <div className="foot-grid">
      <div className="foot-brand">
        <span className="brand-mark">J<span>&</span>H</span>
        <p>Consultoría y servicios profesionales con experiencia, compromiso y valor. Su confianza, nuestra prioridad.</p>
      </div>
      <div className="foot-col">
        <b>Navegación</b>
        <a href="#nosotros">Nosotros</a>
        <a href="#servicios">Servicios</a>
        <a href="#clientes">Clientes</a>
        <a href="#fundador">Fundador</a>
      </div>
      <div className="foot-col">
        <b>Contacto</b>
        <a href="tel:+18722020156">(872) 202-0156</a>
        <a href="mailto:jhmultiservices10@gmail.com">jhmultiservices10@gmail.com</a>
        <a href="https://jh-multiservices.com/" target="_blank" rel="noopener">jh-multiservices.com</a>
      </div>
    </div>
    <div className="foot-bottom">
      <span>© 2026 J&H MultiServices LLC. Todos los derechos reservados.</span>
      <span>«Trabajemos juntos»</span>
    </div>
  </div>
</footer>
</div>{/*  /page  */}
    </>
  );
}
