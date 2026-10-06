# Prompt para Cursor — Mejorar el CRM con UX/UI y flujos estilo Fondify Agency

## Cómo usarlo
1. Abre tu repo del **segundo CRM** en Cursor.
2. Adjunta el archivo `fondify-ux-clone.tar.gz` (o arrastra la carpeta `fondify-ux-clone/`) al chat Agent/Composer.
3. Pega el bloque **PROMPT** de abajo.

---

## PROMPT

```
Mejora mi CRM para que el panel de agencia se alinee con Fondify Agency (referencia de producto/UX), SIN copiar código ni assets de fondify.io.

## Contexto adjunto (paquete fondify-ux-clone/)
Usa estos archivos como especificación:
- INVENTARIO-UX.md — pantallas, estados, patrones, rutas de referencia
- PROMPT-CURSOR.md — este brief
- design-system/tokens.css — variables CSS (colores, tipo, spacing, z-index)
- design-system/COMPONENTS.md — catálogo de componentes
- design-system/index.html — styleguide vivo
- mockups/index.html — hub de maquetas
- mockups/resumen.html, clients.html, client-detail.html, reports.html, team.html, marketing.html, business-leads.html, affiliates.html, brand.html, planes.html, mock.css
- screenshots/ — capturas reales de Fondify (referencia visual)

## Objetivo
Audita el CRM actual y porta la experiencia de agencia:
Prioridad P0: Shell (sidebar+topbar) · Resumen · Clientes (filtros/búsqueda/filas) · Detalle cliente (Action Center + Cierra la venta) · Reportes
P1: Equipo · Mi Marca · Planes
P2: Email Marketing · Prospección · Afiliados

## Reglas
1. Adapta tokens.css al stack del repo (CSS vars, Tailwind theme, o design tokens nativos).
2. Implementa componentes del catálogo (StatusPill, FilterPills, ClientRow, KPI, Modal, EmptyState, PageHeader, ActionBar sticky).
3. Mapea UI a modelos/APIs EXISTENTES del CRM. Si falta dato: UI + TODO o mock tipado — no inventes backend Fondify.
4. Flujos mínimos reales: listar/filtrar clientes, abrir ficha, ver documentos/reportes según datos del CRM; cotización/contrato pueden ser UI+estados primero.
5. Empty states y modales como en el inventario (texto, dashed cards, backdrop).
6. No scrapees fondify.io. No commits de secretos. Desktop-first.
7. Academia es link externo (Skool) — no la clones dentro del CRM salvo que ya exista.

## Entrega
- Cambios por PR o commits claros por pantalla
- Lista de gaps vs inventario
- Screenshots before/after de Clientes + detalle + Resumen
- Cómo correr la app localmente

Empieza por auditar la estructura del repo y proponer el plan de P0 antes de codear en masa.
```

## Contenido del paquete
| Ruta | Uso |
|------|-----|
| INVENTARIO-UX.md | Spec funcional/visual |
| design-system/* | Tokens + componentes + styleguide |
| mockups/* | HTML de referencia navegable |
| screenshots/* | Pixel reference |
