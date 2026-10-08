# Fondify Agency → jh-crm (clon funcional)

Inventario de scraping 2026-10-08 (`fondify.io/agency`, ficha carmen /3093) + mapa a jh-crm.

**Sin secretos ni URLs firmadas.** Rotar cualquier contraseña compartida en chat.

**Regla de producto:** clonar **funciones**, no paleta/UX Fondify. Popups vía `AgencyModal` + design tokens jh-crm.

---

## 1. Inventario Fondify scraped

### 1.1 Nav agency

| Módulo | Función |
|---|---|
| Resumen | KPIs, enlaces share/QR, “qué funciona”, actualizar reporte, listos fondeo |
| Clientes | Lista + filtros + import/agregar/share |
| Mi Equipo | Miembros |
| Reportes | Reportes agency |
| Email Marketing | Campañas |
| Prospección en Frío | Outreach |
| Afiliados | Referral |
| Mi Marca | Branding / firma |
| Mi reporte / Ver planes | Cuenta Fondify |
| Notificaciones · Novedades · ES/EN | Chrome global |

### 1.2 Lista Clientes

- Buscar nombre/correo
- Filtros: Todos · Listos fondeo · Estructuración · Reparación
- Acciones: Comparte enlace · Importar · Agregar
- Fila: etapa, Ronda N, email, Revisar en Xd / hoy, # reportes

### 1.3 Ficha cliente — Action Center

**Header:** etapa · email · # reportes · Ronda + revisar + centro rondas · Documentos(N) · Editar · Unir · Eliminar · Subir reporte · HISTORIAL · KPIs · banner · guion CROA (Asesoría / Meses / Enviar / Copiar).

| Cápsula | Destino Fondify |
|---|---|
| Reporte de crédito | Viewer PDF |
| Plan de Acción | Pantalla full |
| Análisis | Modal negativos |
| Score Plan | Modal utilización |
| Fondeo | Calculadora |
| Avance | **Popup** Gestión \| Vista cliente |
| Cotización | **Popup** (estado Sin enviar / …) |
| Contrato | **Popup** (Borrador / …) |
| Formulario iniciación | **Popup** (Sin llenar / …) |

### 1.4 Avance (popup)

- Tabs: **Gestión** | **Vista cliente**
- Vista cliente: ES/EN · Copiar link · Enviar email · Descargar PDF
- Contenido: badge ronda · gauges 3 burós · qué limpiar · categorías
- Gestión: comparar rondas; marcar método + disputar (tip Resumen)

### 1.5 Cotización (popup)

- Auto desde negativos (Asesoría, Charge Off, Pagos tardíos, Info personal, Consultas)
- Líneas editables + Añadir · subtotal + cargo · plan de pago
- Enviar / Guardar / Restablecer / PDF · ES/EN · cliente fijo

### 1.6 Contrato (popup)

- Empresa (marca) · cliente · pagos individual/pareja · meses · firma
- Ver PDF · Enviar para firma · FCRA/CROA · prefill desde cotización

---

## 2. Mapa → jh-crm

| Fondify | Código jh-crm | Gap |
|---|---|---|
| Reporte PDF | `client-credit-report-*`, `/reportes/.../pdf` | Hecho |
| Plan de Acción | `/plan-de-accion`, `action-plan.ts` | Hecho |
| Análisis | `ClientNegativeAnalysisPanel` | Hecho |
| Score / Fondeo | Modales en `agency-client-detail` | Parcial |
| Avance popup | `ClientAvancePanel` Gestión embebida + Vista cliente + `/a/[token]` | **Hecho** (Gestión = list/create/detail/cartas en modal; `/crm/casos/.../rondas*` → hub) |
| Cotización popup | `QuoteForm` + hub | Hecho |
| Contrato popup | Contratos CRM + hub | Hecho |
| Formulario | Intake links + cápsula | Hecho |
| Lista/Resumen/Equipo… | Varias rutas CRM | Fase 7+ |

Archivos ancla:

- [`src/components/clients/agency-client-detail.tsx`](../src/components/clients/agency-client-detail.tsx)
- [`src/components/quotes/quote-form.tsx`](../src/components/quotes/quote-form.tsx)
- [`src/server/progress-reports/index.ts`](../src/server/progress-reports/index.ts)
- [`src/server/portal/index.ts`](../src/server/portal/index.ts)
- [`docs/FONDIFY_ACTION_CENTER_SPEC.md`](./FONDIFY_ACTION_CENTER_SPEC.md)

---

## 3. Orden de implementación

| Fase | Entrega | Estado plan |
|---|---|---|
| 0 | Este MD | ✓ |
| 1 | Badges Cierre + popups placeholder | ✓ |
| 2 | Avance popup + link + PDF | ✓ |
| 3 | Cotización embebida | ✓ |
| 4 | Contrato popup | ✓ |
| 5 | Formulario iniciación | ✓ |
| 6 | Polish Action Center ficha | ✓ |
| 7+ | Nav agency (lista, resumen, equipo, marca…) | Lista ✓ parcial; resto diferido |

### Avance Gestión (post F2)

- Source of truth: popup Avance en `/crm/clientes/:id` (`ClientAvancePanel` + `EmbeddedRoundWorkspace`).
- Deep-link: `?panel=avance&roundId=`.
- Legacy `/crm/casos/:caseId/rondas*` redirige al hub.

### Fase 7+ backlog

1. ~~Lista Clientes: filtros + import/share~~ — **hecho** (`FilterPills`, CSV, share). Aliases `?status=LEAD|ACTIVE` → buckets Fondify.
2. Resumen dashboard: KPIs, actualizar reporte, listos fondeo, “qué funciona”
3. Mi Equipo / Mi Marca / Reportes agency
4. Email Marketing / Prospección / Afiliados (evaluar integraciones externas)

---

## 4. Criterios por fase (resumen)

- **F1:** badges reales; click → modal (stub OK).
- **F2:** Gestión/Vista cliente; copiar link; PDF; Gestión = crear/abrir rondas + disputas/cartas en el modal (sin `/crm/casos` como UX).
- **F3:** quote sin selects cliente/caso; líneas desde negativos.
- **F4:** contrato desde hub; PDF + firma.
- **F5:** estado intake en cápsula; copiar/enviar link.
- **F6:** docs count, guion, rondas header coherentes.
- **F7+:** fuera del primer batch; ver §3.

---

## 5. Fuera de alcance inmediato

- Pixel-perfect / colores Fondify
- Email Marketing / Prospección / Afiliados (evaluar integraciones)
- Credenciales Fondify en código
