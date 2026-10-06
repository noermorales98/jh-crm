# Fondify Agency — Catálogo de componentes

Documentación es-MX del design system clonado del panel agencia Fondify.
Tokens: ver `tokens.css`. Styleguide vivo: `index.html`.

---

## 1. Shell (sidebar + topbar)

**Anatomía**
- **Topbar** (blanco, altura `--ff-topbar-height`): logo Fondify a la izquierda; a la derecha campana, “Novedades”, ayuda (?), switch ES/EN, grid de apps, avatar.
- **Sidebar** (blanco, ancho `--ff-sidebar-width`):
  1. Card de agencia: logo + nombre + kicker `PANEL DE AGENCIA`
  2. Nav items con icono lineal + label
  3. Footer: “Mi reporte de crédito” + botón outlined **Ver planes**
- **Canvas**: fondo `--ff-bg` (#eef1f6); contenido en cards blancas.

**Estados**
| Estado | Apariencia |
|--------|------------|
| Nav default | texto/icono `--ff-text-secondary` |
| Nav hover | fondo `--ff-primary-tint` |
| Nav activo | fondo `--ff-primary-soft` (#f0e8f6), texto/icono `--ff-primary` |
| Dropdown topbar abierto | card blanca + `--ff-shadow-md`, z `--ff-z-dropdown` |
| Switch ES/EN | pill; idioma activo en `--ff-text`, inactivo muted |

**Pantallas**
Todas las rutas `/agency/*`. Variante consumidor (`/dashboard`): sidebar sin card de agencia; footer “Mi panel de agencia”; sin “Novedades”.

---

## 2. PageHeader

**Anatomía**
```
[KICKER ALLCAPS]          ← .ff-kicker  (ej. "4 CLIENTES", "MARTES, 6 OCT")
Título grande             ← .ff-page-title
Subtítulo gris            ← .ff-page-subtitle
                    [ActionBar de botones a la derecha]
```

**Estados**
- Con/sin kicker (Resumen usa fecha; Marketing a veces solo título).
- Con back-link (`← Clientes`) en detalle / vistas inline.
- Contador dinámico: búsqueda vacía en Reportes cambia kicker a `0 REPORTES`.

**Pantallas**
Clientes, Reportes, Resumen, Email Marketing, Equipo, Prospección, Afiliados, Mi Marca, Detalle cliente.

---

## 3. KPI cards

**Anatomía**
- Card blanca, radio `--ff-radius-lg`, sombra suave.
- Kicker ALLCAPS arriba (ej. `CLIENTES`, `FONDEO POTENCIAL`).
- Valor grande (`--ff-fs-2xl`, bold) — puede ser número, `$0`, `4 / ∞`, o guion.
- Subtexto muted debajo.

**Variantes**
| Variante | Uso |
|----------|-----|
| Neutro | strip Resumen / Marketing (CONTACTOS, etc.) |
| Énfasis peligro | valor rojo (`POR ARREGLAR · 5`) |
| Énfasis primary | valor púrpura (`ASESORÍA HOY · $483`) |
| Total magenta | fila Total en Ganancias potenciales (`--ff-magenta` #fb7185) |

**Estados**: vacío (valor `0` / `—` + subtexto explicativo); cargando (no visto de forma consistente).

**Pantallas**
Resumen (4 KPIs), Detalle cliente (3 KPIs), Marketing Campañas (4 KPIs en 0), Afiliados.

---

## 4. FilterPills

**Anatomía**
- Fila horizontal de pills `--ff-radius-full`.
- Label ALLCAPS + `·` + conteo (`TODOS · 4`).
- Suele ir junto a search input (“Buscar por nombre o correo…”).

**Estados**
| Estado | Apariencia |
|--------|------------|
| Inactivo | bg status-soft, texto status-fg, borde sutil |
| Activo | mismo color de estado + **borde más oscuro** del status |
| Focus search | borde `--ff-primary` |
| Empty filtro | mensaje “Ningún cliente coincide con el filtro.” |

**Colores por status** → tokens `--ff-status-*-*`.

**Pantallas**
Clientes (TODOS / LISTOS PARA FONDEO / ESTRUCTURACIÓN / REPARACIÓN). Documentos usa chips similares (Todos/Cotizaciones/…).

---

## 5. ClientRow

**Anatomía** (fila en card agrupada, no `<table>`)
```
[Nombre bold] [StatusPill] [Pill RONDA N]
email muted ·  Revisar en Nd (naranja si cerca)
                                    REPORTES
                                       N
                                       ›
```

**Estados**
- Default / hover (fondo tint muy suave).
- Click → navega a detalle.
- “Revisar en Nd”: verde/gris si lejano; `--ff-orange-review` si cerca (ej. 2d).

**Pantallas**
Lista Clientes. Filas similares en Documentos, Unir expedientes, Avance (tabla agrupada).

---

## 6. StatusPill

**Anatomía**
- Chip pequeño, radio `--ff-radius-sm`, padding `2px 8px`.
- Texto ALLCAPS semibold, tamaño `--ff-fs-xs`.

**Variantes**
| Pill | BG | FG | Uso |
|------|----|----|-----|
| REPARACIÓN | `--ff-status-repair-bg` | `--ff-status-repair-fg` | clientes / filtros |
| LISTOS PARA FONDEO | `--ff-status-ready-*` | | filtros / legend |
| ESTRUCTURACIÓN | `--ff-status-struct-*` | | filtros / legend |
| RONDA N | `--ff-status-round-*` | | ClientRow + Avance |
| NUEVO | sólido primary | blanco | tiles / sidebar Ofertas |
| BETA | naranja | blanco | Action Center tiles |
| NEED REPAIR etc. | mismos tokens | | i18n EN |

**Pantallas**
Clientes, Detalle, Plan de Acción (No calificado / Estimado fondeo / bureaus), filtros, legend Calificación.

---

## 7. Modal

**Anatomía**
- Backdrop `--ff-overlay` (a veces con blur).
- Card blanca centrada, radio `--ff-radius-xl`, sombra `--ff-shadow-modal`, z `--ff-z-modal`.
- Header: título + `×` arriba derecha.
- Body scrollable; footer de acciones (a veces sticky dentro del modal).

**Estados**
| Estado | Nota |
|--------|------|
| Abierto | focus trap implícito; **mayoría ignora Escape** |
| Escape OK | solo “Comparte tu enlace” (y Novedades) |
| Forms largos | acciones fijas abajo (Cotización, Contrato) |
| Sin Cancel | Agregar cliente: solo `×` + CTA full-width |
| Warning | Unir expedientes: copy irreversible |

**Tamaños**: sm (Agregar/Editar ~420px), md (Comparte/Importar), lg (Cotización/Avance/Score Plan).

**Pantallas**
Agregar cliente, Importar, Comparte tu enlace, Editar, Unir expedientes, Documentos, Cotización, Contrato, Formulario iniciación, Centro de rondas, Análisis, Score Plan, Fondeo, Avance, Interest Killer “Nueva tarjeta”, Invita y gana (acuerdo).

---

## 8. EmptyState

**Dos variantes**

### 8a. Línea (inline en card)
- Una línea de texto muted centrada dentro de card blanca.
- Opcional: icono small + divider bajo el header de la card.
- Ej.: “Aún no hay datos que medir.” · “Ningún cliente tiene el reporte vencido…”

### 8b. Dashed (bloque grande)
- Contenedor radio `--ff-radius-xl`, borde dashed `--ff-border-dashed`.
- Icon tile lavanda (círculo `--ff-primary-soft` + icono primary).
- Título bold + help muted centrados.
- Ej.: Marketing Campañas “Aún no tienes campañas”; Generador AI “Tu secuencia aparecerá aquí”; dropzone Importar CSV.

**Estados**: vacío de filtro vs vacío de producto (copy distinto — Reportes no dice “sin resultados”).

**Pantallas**
Resumen paneles, filtros Clientes, Reportes búsqueda, Marketing (Generador/Campañas), crédito dashboard empties, dropzones (Importar, logo Mi Marca, Listas CSV).

---

## 9. Table

**Anatomía**
- Header fila: labels ALLCAPS muted.
- Filas: CLIENTE (nombre+email) · ARCHIVO (`ff-mono`) · FECHA (`ff-mono`) · acciones.
- Separadores `--ff-border`; contenedor card redondeada.

**Estados**
- Hover fila.
- Vacío → EmptyState línea o genérico.
- Acciones por fila: Ver / PDF / Abrir / Enlace.

**Pantallas**
Reportes, Documentos, Avance (agrupada por categoría), Cotización (líneas), listados de Unir expedientes.

---

## 10. ActionBar (sticky)

**Anatomía**
- Fila de botones alineada a la derecha del PageHeader **o** fija abajo en forms/modales largos.
- En detalle cliente: dentro del header card (Documentos · Editar · Unir · Eliminar · Subir reporte).
- Sticky usa `z-index: var(--ff-z-sticky)` + fondo surface + borde superior.

**Estados**: scroll (queda pegada); disabled en submits.

**Pantallas**
Clientes (Comparte / Importar / Agregar), Detalle acciones, Cotización/Contrato footers, Plan de Acción (Descargar PDF), Score Plan footer.

---

## 11. Buttons

| Variante | Clase sugerida | Apariencia | Uso |
|----------|----------------|------------|-----|
| Primary | `.ff-btn-primary` | bg `--ff-primary`, texto blanco, radio md | Agregar cliente, Subir reporte, Copiar, CTAs |
| Outlined | `.ff-btn-outlined` | borde primary, texto primary, bg transparent | Comparte tu enlace, Importar, Ver planes |
| Ghost / secondary | `.ff-btn-ghost` | borde `--ff-border`, texto secondary | Editar, Unir, Documentos |
| Danger outlined | `.ff-btn-danger` | borde/texto `--ff-danger` | Eliminar |
| Soft lavanda | `.ff-btn-soft` | bg `--ff-primary-soft`, texto primary | “Ver mis primeros 7 días” |
| Link | `.ff-btn-link` | texto primary, sin borde | Compartir / QR, Pasar a Empresarial |

**Estados comunes**: default · hover (primary-hover) · pressed · disabled (opacity 0.5) · loading (spinner púrpura).

**Pantallas**: ubicuos.

---

## 12. Tabs

**Anatomía**
- Fila horizontal bajo PageHeader; icono opcional + label.
- Activo: texto primary + **underline** primary (2–3px).
- Inactivo: texto muted.

**Estados**: activo / hover / disabled. Query `?tab=` en Marketing.

**Pantallas**
Email Marketing (Imán / Generador AI / Campañas / Listas / Envío), Interest Killer (Personales / Negocio), Avance toggle Gestión/Vista cliente, Planes Mensual/Anual.

---

## 13. Forms

**Anatomía**
- Label muted arriba del input.
- Input: bg white, borde `--ff-border`, radio `--ff-radius-md`, padding `--ff-space-3`.
- Focus: borde `--ff-primary` (+ ring suave opcional).
- Hint / error debajo.
- Dropzone dashed para archivos (CSV, logo).
- Select nativo en seats (1–10).
- Color hex picker en Mi Marca (default `#1E34A4`).

**Estados**: default · focus · error · disabled · filled.

**Pantallas**
Agregar/Editar cliente, Importar, Cotización, Contrato, Formulario iniciación, Centro de rondas, Fondeo (DATOS DEL NEGOCIO), Envío SMTP, Mi Marca, Equipo invite, Interest Killer Nueva tarjeta.

---

## 14. Toast

**Estado en inventario:** **no vistos** (nada se envió en la sesión de captura). No hay evidencia de posición, duración ni variantes success/error.

**Recomendación de clon (provisional)**
- Posición: bottom-center o top-right, z `--ff-z-toast`.
- Card compacta con sombra `--ff-shadow-md`, auto-dismiss ~3s.
- Variantes: success (verde), error (rojo), info (primary).
- Confirms destructivos: preferir modal warning (patrón Unir expedientes) hasta validar toasts reales.

Marcar como **pendiente de captura** si se implementa envío real.

---

## Mapa rápido pantalla → componentes

| Pantalla | Componentes clave |
|----------|-------------------|
| Resumen `/agency` | Shell, PageHeader (fecha), KPI, EmptyState línea, cards Ganancias (magenta), legend status |
| Clientes | PageHeader, ActionBar, FilterPills, ClientRow, StatusPill, Modal |
| Detalle cliente | PageHeader back, StatusPill, ActionBar, KPI, banner warning, Action Center tiles |
| Reportes | PageHeader, Table, EmptyState, mono fechas/archivos |
| Marketing | Tabs, KPI, EmptyState dashed, plan limits banner |
| Mi Marca | Forms largos, dropzone, color `#1E34A4` |
| Planes | Tabs Mensual/Anual, cards pricing (borde primary en Pro) |
| Dashboard crédito | Shell variante, gradient hero, EmptyState, Button primary |
| Modales Action Center | Modal lg, Forms, StatusPill, Table (Avance) |

---

## Notas i18n (es-MX)

- Copy del inventario está en español; switch ES↔EN cambia pills (`REPARACIÓN` → `NEED REPAIR`, `RONDA` → `ROUND`).
- Fechas kicker: `MARTES, 6 OCT` (locale es).
- Moneda: `$` sin locale forzado en UI; mantener formato visto (`$7,250`, `$483`).
- Documentación de este design system: **español (méxico-friendly)**; nombres de componentes en PascalCase inglés para código.
