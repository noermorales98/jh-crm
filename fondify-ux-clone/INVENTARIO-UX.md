# Fondify Agency — inventario UX/UI (para clonar)

Fuente: sesión agencia **JH & Multiservices LLC** · https://fondify.io/agency  
Fecha extracción: 6 oct 2026 (America/Cancun)

## Shell global (todas las pantallas)

### Top bar (blanco)
- Izquierda: logo Fondify
- Derecha: campana, **Novedades**, ayuda (?), switch ES/EN, icono grid de apps, avatar

### Sidebar izquierda (fondo claro, iconos lineales)
- Card de agencia: logo + nombre + label pequeña **PANEL DE AGENCIA**
- Ítems: Resumen · Clientes · Mi Equipo · Reportes · Email Marketing · Prospección en Frío · Afiliados · Mi Marca
- Activo: highlight lavanda clara + texto púrpura
- Abajo: “Mi reporte de crédito” + botón outlined púrpura **Ver planes**

### Look & feel
- Fondo: gris-lavanda claro
- Cards: blancas, bordes suaves, esquinas redondeadas
- Primario: púrpura profundo (CTAs)
- Encabezados de página: label gris ALL-CAPS (ej. `4 CLIENTES`) → título grande → subtítulo gris
- Estados: pills pastel — rojo REPARACIÓN · verde LISTOS PARA FONDEO · amarillo ESTRUCTURACIÓN
- Fechas / nombres de archivo: monoespaciada
- Banner Trustpilot “Escribir reseña” (púrpura, cerrable) en varias páginas

---

## a) Resumen (Dashboard) — `/agency`
**Título:** Panel de Agencia · Fondify

- Popup primer load **Novedades** (cerrar con Escape): panel izq. púrpura oscuro, top gradient, slides + Siguiente + “Copiar mi enlace”
- Header: fecha ALL-CAPS (`MARTES, 6 OCT`) + “Resumen de tu agencia”
- Setup: 3 grupos de botones de opción + CTA **Ver mis primeros 7 días**
- **Tus dos enlaces:** signup cliente + referral agencia (Copiar / Compartir / QR)
- 4 KPI cards: CLIENTES · REPORTES GENERADOS · FONDEO POTENCIAL TOTAL · PDFS DEL PLAN
- Paneles: Qué funciona · Ganancias potenciales · Calificación de clientes · Tiempo de Actualizar Reporte · Listos para Fondeo

## b) Clientes — `/agency/clients`
- Título “Clientes” + subtítulo “Toca un cliente para ver su caso y cerrar la venta.”
- Botones: Comparte tu enlace (outlined) · Importar clientes · **Agregar cliente** (púrpura)
- Filtros: search “Buscar por nombre o correo…” + pills con conteo (TODOS, LISTOS PARA FONDEO, ESTRUCTURACIÓN, REPARACIÓN)
- Lista = filas en card (no tabla): nombre, pill estado, pill RONDA N, email, “Revisar en Nd” (naranja si cerca), conteo REPORTES, ›
- Click en fila → detalle

## c) Detalle cliente — `/agency/clients/:id`
- Card header: ← Clientes · nombre + pill · email · reportes · Ronda · Revisar en Nd · “Abrir centro de rondas →”
- Acciones: Documentos (badge) · Editar · Unir expedientes · Eliminar (rojo outlined) · **Subir reporte** (púrpura)
- HISTORIAL (chip fecha)
- Banner alerta amarillo (oportunidad de reparación)
- 3 KPI: POR ARREGLAR · FONDEO POTENCIAL · ASESORÍA HOY
- **Action Center**
  1. Analiza y muestra el valor — tiles: Reporte de crédito, Plan de Acción, Análisis, Score Plan, Fondeo, Avance (badges NUEVO/BETA)
  2. Cierra la venta — Cotización / Contrato / Formulario de Iniciación (estados Sin enviar / Borrador / Sin llenar) + Enviar cotización + guion de venta + Copiar guion

## d) Reporte de crédito (inline)
- ← Volver a {cliente} · label REPORTE DE CRÉDITO · fecha + archivo · Abrir en pestaña nueva
- Visor PDF full-width + thumbnails de páginas

## e) Reportes — `/agency/reports`
- Label `N REPORTES` · “Todos los reportes” · search
- Tabla: CLIENTE (nombre+email) · ARCHIVO (mono) · FECHA · PDF · botones Ver / PDF

## Otras secciones
| Ruta | Notas |
|------|--------|
| `/agency/team` | seats, invitar email, comprar asiento |
| `/agency/marketing` | tabs Imán / Generador AI / Campañas / Listas / Envío; preview teléfono |
| `/agency/business-leads` | búsquedas restantes, categoría, ciudad, Buscar |
| `/agency/affiliates` | enlaces, slider ganancias, KPIs, red |
| `/agency/brand` | white-label form centrado |

## Pendiente de captura profunda
- Tiles Action Center: Plan de Acción, Análisis, Score Plan, Fondeo, Avance
- Dashboard sin popup Novedades
- `/agency/planes` (solo lectura)

---

## Actualización: Resumen limpio + Action Center + Planes

### Resumen sin popup — `/agency`
- Card de bienvenida cerrable (×): 3 columnas de preguntas + CTA lavanda “Ver mis primeros 7 días ›”
- Layout 2 columnas: izquierda = KPIs strip + Qué funciona / Ganancias potenciales (Total magenta) / Calificación (barra + leyenda); derecha = Tiempo de Actualizar Reporte + Listos para Fondeo (vacíos)
- Enlaces: filas con icono, título, descripción, link mono, Compartir/QR + Copiar púrpura

### Action Center (mismo URL `/agency/clients/:id`, sin ruta propia)

**Plan de Acción** — vista full-page inline (spinner varios segundos)
- ← Volver · título centrado “Análisis de Crédito y Plan de Acción” · agencia · “Analizando a:” · Descargar PDF
- 3 pills: No calificado (rojo) · Estimado fondeo (amarillo) · N de 3 bureaus (púrpura)
- Secciones numeradas: 1 Desglose por Buró (barras scores + utilización, umbrales 720 / 10%, Ver detalle, criterios) · 2 Estructura · …

**Análisis** — popup “Cuentas negativas” + BETA
- Summary: negativos / totales + chips (charge-offs, late, datos incorrectos, hard inquiries)
- Secciones por categoría con color; filas: acreedor, pill, chips EQ/EX/TU, Ver detalle; nota verde de disputa

**Score Plan** — popup header gradient púrpura SCORE PLAN · BETA
- Utilización % + targets 30%/10% + slider simulación
- “¿Y si cierras una tarjeta?” dropdown
- “1 · Paga en este orden”: filas con % · monto · Paga antes
- Footer: PDF + Copiar plan para el cliente

**Fondeo** — popup “Calculadora de Fondeo”
- Form DATOS DEL NEGOCIO (nombre, tiempo, NAICS, cash)
- Chips bancos (cuentas 3+ meses / tarjetas activas)
- CTA full-width Calcular fondeo

**Avance** — popup grande
- Toggle Gestión / Vista cliente · Copiar link · ×
- Loading: “Cargando reporte de avance…”
- Loaded: pill RONDA · instrucción · seleccionar todas · tabla (Cuenta, Buró, Saldo, Resultado vs ronda, Método, Disputar) agrupada por categoría

### Planes — `/agency/planes`
- ← Panel · switch Mensual/Anual
- Cards: Gratis por afiliación $0 · **Pro $197/mes** (TU NIVEL, borde púrpura) · Empresarial $697/mes · Lifetime no disponible
- Box Lifetime $7,500 − crédito

---

## Profundización: estados, filtros y modales (solo lectura)

### Patrones de UI
- **Modales:** card blanca redondeada sobre backdrop oscuro (a veces blur); × arriba derecha. La mayoría **ignora Escape** (salvo Comparte tu enlace).
- **Forms largos (Cotización, Contrato):** acciones fijas abajo; cuerpo con scroll.
- **Spinners:** púrpura centrado bajo back-link (Plan de Acción); Avance con copy “Cargando reporte de avance… Comparando las rondas…”
- **Empty states:** una línea gris en card blanca (+ a veces icono).
- **Toasts / confirms:** no vistos (nada se envió).

### Clientes — filtros y modales
- Pill activa: borde más oscuro del color del estado.
- Empty filtro: “Ningún cliente coincide con el filtro.”
- Search live (sin botón); focus border púrpura; mismo empty.
- **Agregar cliente:** Nombre + Correo + CTA púrpura Agregar; sin Cancel (solo ×).
- **Importar:** dashed dropzone CSV/XLSX; mención Dispute Fox / Credit Repair Cloud.
- **Comparte tu enlace:** label púrpura + link mono + Copiar + tiles WhatsApp / Email / QR.

### Detalle cliente — popups (URL no cambia)
- **Documentos:** chips Todos/Cotizaciones/Contratos/Formularios/PDF; filas con fecha mono, tipo, status, Abrir/Enlace/PDF.
- **Editar:** Nombre/Correo + Guardar cambios.
- **Unir expedientes:** warning irreversible + search + lista + Cancelar.
- **Cotización:** header COTIZACIÓN púrpura, ES/EN, tabla líneas, Enviar / Guardar / Restablecer / PDF.
- **Contrato:** EMPRESA / CLIENTE / PAGOS; Ver PDF + Enviar para firma (navy).
- **Formulario iniciación:** link onboarding + Copiar + Enviar email + “Esperando…”
- **Centro de rondas:** Ronda, fechas, Asignado a, Guardar estado.

### Reportes
- Search “vacío” cambia título a `0 REPORTES` y muestra empty genérico “Aún no hay reportes…” (no dice “sin resultados”).
- **Ver** → `/agency/report/<uuid>` = misma vista Plan de Acción; **PDF** = reporte crudo.

---

## Profundización 2: marketing, marca, top bar, i18n

### Email Marketing `/agency/marketing`
- Tabs con underline; `?tab=envio` desde Mi Marca.
- **Generador AI:** dropdown segmentos + radios objetivo; panel vacío dashed “Tu secuencia aparecerá aquí”.
- **Campañas empty:** barra límites plan + upgrade; “+ Nueva campaña” → salta a Generador AI (no modal); KPIs en 0; empty dashed.
- **Listas:** upload CSV dashed; segmentos vivos con count + Crear campaña.
- **Envío:** form SMTP + help Gmail/Outlook/iCloud; pill “Requerido para enviar”.

### Mi Equipo / Prospección / Afiliados
- Invite focus: borde lavanda; seats = select nativo 1–10.
- Comprar búsquedas: packs 50/$19 · 100/$29 · 250/$59 (no comprar).
- Afiliados: checkbox inglés añade `&lang=en`; QR inline en card (no popup).

### Mi Marca (form largo)
- Datos negocio · Conectar correo → Envío · WhatsApp + país · Calendly · logo dashed · color hex (#1E34A4) · firma · Guardar marca.

### Top bar (dropdowns blancos con sombra)
- Bell empty · Ayuda (soporte + guías “Muy pronto”) · Productos (Credit Report / Panel / Academia) · Avatar (Mi cuenta / Cerrar sesión rojo) · Novedades (2 slides).

### i18n
- Switch ES↔EN instantáneo en shell + pills (NEED REPAIR, ROUND, etc.).

### Patrones extra
- Empty dashed + icon tile + título + help.
- Barras de límites de plan con link upgrade.
- Algunos CTAs son navegación a otra tab, no modales.

---

## Producto consumidor: Mi crédito `/dashboard`

### Diferencias vs panel agencia `/agency`
- Sidebar blanca **sin** card de agencia: Inicio, Reporte, Credit DNA, Score Pulse, Smart Plan, Interest Killer, Ofertas (NUEVO), Invita y gana.
- Abajo: outlined **Mi panel de agencia** (vuelve a /agency).
- Top bar: sin Novedades; avatar persona (no edificio).
- Template: banda gradient pastel (naranja-rosa-púrpura) + card blanca grande con logo, VantageScore® 3.0, título con punto final, subtítulo.

### Pantallas (cuenta sin reporte personal → empties)
- Inicio: Hola · Activar mi reporte (loading spinner primero).
- Reporte / DNA / Pulse / SmartPlan: empty centrado icono lavanda + CTA.
- Interest Killer: tabs Personales/Negocio + modal Nueva tarjeta (emisor, tipo, fin 0%, límite, balance, corte, pago, APR).
- Ofertas: Préstamos (ANUNCIO) + Tarjetas PRÓXIMAMENTE.
- Invita y gana: popup acuerdo afiliado + CTA gradient (no aceptar).

## Academia
- **No está en Fondify**: el grid abre Skool `skool.com/negociocapital` (Negocio Capital). Sin unirse no hay cursos/lessons que clonar dentro de la app.
