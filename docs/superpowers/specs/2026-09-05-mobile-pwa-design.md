# Design: CRM/Portal mobile-first + PWA ligera

**Fecha:** 2026-09-05  
**Estado:** aprobado (enfoque A)  
**Alcance:** usable en celular + instalable (sin offline complejo).

## Objetivos

1. CRM usable con una mano: bottom nav + “Más”.
2. Portal con nav inferior.
3. Modales cómodos en móvil (hoja inferior / casi full height).
4. Safe-area (notch / home indicator).
5. PWA ligera: manifest, iconos, theme-color, apple-web-app (sin service worker offline en esta fase).

## No objetivos

- Offline / sync complejo.
- App nativa.
- Rediseñar todas las tablas a cards (solo mejorar scroll/touch mínimo).

## CRM

- Bottom nav fija (`lg:hidden`): Inicio, Hoy, Clientes, Casos, Más.
- Sidebar desktop (`lg+`) se mantiene.
- Header: menos saturado en móvil (menú hamburguesa puede ceder a bottom nav; conservar buscar/notificaciones).
- Main: `padding-bottom` para no tapar contenido con la barra.
- Safe-area: `env(safe-area-inset-*)` en header, bottom nav, modales.

## Modales

- En viewport estrecho: panel alineado abajo, `max-h` alto, bordes superiores redondeados (sheet).
- Desktop: sin cambio relevante (centrado).

## Portal

- Bottom nav: Inicio, Progreso, Documentos, Reportes, Pagos.
- Quitar o reducir tabs superiores duplicados en móvil.
- Safe-area.

## PWA

- `app/manifest.ts` o `public/manifest.webmanifest`
- Icons (usar AppIcon / generar PNG estáticos si hace falta)
- `viewport`, `themeColor`, `appleWebApp` en `app/layout.tsx`
- `display: standalone`, `start_url: /crm/dashboard` (staff) — portal puede compartir mismo manifest o `start_url: /`

## Criterios de éxito

- [ ] En &lt;1024px, CRM navega con barra inferior sin depender solo del drawer.
- [ ] Portal marca sección activa en barra inferior.
- [ ] Modal de formulario usable en iPhone sin “perder” botones bajo el teclado (scroll interno + sheet).
- [ ] “Añadir a pantalla de inicio” posible (manifest + icons + meta).
