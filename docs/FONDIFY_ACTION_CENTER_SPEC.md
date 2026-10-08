# Fondify Action Center → jh-crm

Spec de implementación a partir del scraping de `https://fondify.io/agency/clients/:id` (cliente de referencia: carmen / id 3093, 2026-10-08).

**No incluye secretos ni URLs firmadas.**

---

## 1. Inventario UI Fondify

### 1.1 Header de ficha cliente

| Elemento | Comportamiento |
|---|---|
| Nombre + badge etapa (Reparación) | Identidad |
| Email · N reportes | Meta |
| Ronda N · Revisar en Xd · Abrir centro de rondas | Link a rondas |
| Documentos (count) | Modal/lista docs |
| Editar / Unir expedientes / Eliminar | Acciones admin |
| **Subir reporte** | Modal: file PDF → Analizar |
| **HISTORIAL** | Chips por fecha de cada upload; selecciona reporte activo |

### 1.2 KPIs + banner

- Banner oportunidad (ej. N cuentas negativas).
- POR ARREGLAR / FONDEO POTENCIAL / ASESORÍA HOY.

### 1.3 Action Center — «1 · ANALIZA Y MUESTRA EL VALOR»

| Cápsula | Subtítulo | Destino Fondify |
|---|---|---|
| Reporte de crédito | el documento completo | Viewer PDF (1 reporte) o selección vía HISTORIAL |
| Plan de Acción (NUEVO) | lectura + pasos a dar | Pantalla full «Análisis de Crédito y Plan de Acción» |
| Análisis (BETA) | cuentas negativas | Modal categorizado |
| Score Plan (BETA) | sube el puntaje ya | Herramienta utilización |
| Fondeo | cuánto puede conseguir | Calculadora |
| Avance (BETA) | progreso por rondas | Centro de rondas / progreso |

### 1.4 Action Center — «2 · CIERRA LA VENTA»

Cotización · Contrato · Formulario de Iniciación · guion CROA · Copiar guion.

### 1.5 Reporte de crédito (PDF)

Con **1 PDF**:

1. `← Volver a {cliente}`
2. Label `REPORTE DE CRÉDITO`
3. Título = nombre cliente
4. Meta `Reporte del {fecha} · {filename.pdf}`
5. CTA **Abrir en pestaña nueva**
6. `<iframe src="{pdf_url}#view=FitH">`

Con **N PDFs** (Fondify): chips HISTORIAL seleccionan el activo; el botón abre ese PDF.  
**jh-crm (requisito producto):** al clic en la cápsula:

| Count | UX |
|---|---|
| 0 | Empty + Subir / Analizar |
| 1 | Viewer directo |
| 2+ | Lista (fecha, archivo, tipo) → viewer |

### 1.6 Plan de Acción (pantalla full)

1. Header: org, «Analizando a», Descargar PDF, badges calificación/fondeo/bureaus.
2. Desglose por Buró — scores + utilización + «Ver detalle completo».
3. Estructura de Crédito Rotativo — KPIs + tabla.
4. Estrategia AU.
5. Preparación para Financiamiento por Buró (matriz).
6. Veredicto.
7. Plan de Acción — PRIORIDAD 1–6 + modal «Ver cómo solucionar».
8. Secuencia de Financiamiento + footer promedios.

### 1.7 Análisis (cuentas negativas)

Modal BETA: resumen + categorías (charge-off, pagos tardíos, datos personales, inquiries) con ítems por buró y «Ver detalle».

---

## 2. Estado vs Fondify (post A–D)

| Fondify | jh-crm ahora | Pendiente |
|---|---|---|
| Viewer PDF embebido | ✅ `/reportes/[reportId]/pdf` + iframe `?inline=1` | — |
| Lista 0 / 1 / N al clic Reporte | ✅ empty / viewer / lista modal | — |
| Subir reporte en header | ✅ `AnalyzePdfImportButton` | — |
| HISTORIAL chips | ✅ seleccionan `activeReportId` (Plan + Análisis) | — |
| Plan full 8 secciones | ✅ `/plan-de-accion` + how-to (stub modal eliminado) | — |
| Análisis categorizado | ✅ charge-off / late / datos personales / inquiries / other | — |
| AU / edad en plan | ✅ AU por texto de ítem; edad desde `dateOpened` o «Sin dato» | — |
| Descargar PDF del plan | ✅ `/api/clients/:id/action-plan/pdf` (jsPDF) | — |
| Score Plan / Fondeo / Avance | ✅ revolving real / veredicto plan / link rondas | Pixel-perfect Fondify (fuera de alcance) |
| Evolución scores CL-004 | ✅ `/reportes` aparte del PDF | — |

Archivos clave:

- [`src/components/clients/agency-client-detail.tsx`](../src/components/clients/agency-client-detail.tsx)
- [`src/components/clients/client-credit-report-entry.tsx`](../src/components/clients/client-credit-report-entry.tsx)
- [`src/components/clients/client-action-plan-view.tsx`](../src/components/clients/client-action-plan-view.tsx)
- [`src/server/credit-reports/action-plan.ts`](../src/server/credit-reports/action-plan.ts)
- [`app/api/files/[documentId]/download/route.ts`](../app/api/files/[documentId]/download/route.ts) (`?inline=1`)

---

## 3. Mapa de datos

| Dato | Origen jh-crm | Notas |
|---|---|---|
| Scores EXP/EQX/TU | `CreditBureauSnapshot.score` | |
| Utilización | `CreditBureauSnapshot.utilization` | Nullable |
| Negativos / ítems | `CreditItem` | `isNegative`, `negativeType` |
| PDF fuente | `CreditReport.documentId` → `Document` | iframe `?inline=1` |
| Revolving / AU / edad / inquiries | Parcial en snapshots/ítems | Derivado on-read o JSON |
| Prioridades educativas | Catálogo estático | Legal review |
| PDF del Plan | Generación server | Fase posterior |

---

## 4. Pasos de implementación

### Paso A — Spec MD (este documento)

- [x] Inventario + gaps + criterios.

### Paso B — Reporte de crédito (Fase 1)

1. Helper server: listar reportes del cliente con PDF (`documentId` + mime PDF).
2. Ruta viewer `/crm/clientes/[clientId]/reportes/[reportId]/pdf`.
3. Componente iframe + Abrir en pestaña nueva.
4. Entry Action Center: 0 / 1 / N.
5. Botón Subir reporte en hub (reusar import PDF).
6. Mantener `/reportes` para evolución de scores.

**AC Paso B**

- [x] 0 PDF → empty + CTA.
- [x] 1 PDF → viewer directo.
- [x] 2+ → lista → viewer.
- [x] PDF visible inline; «Abrir en pestaña nueva» funciona.
- [x] Subir/analizar PDF sin salir del flujo cliente.

### Paso C — Plan de Acción (Fase 2)

1. Calculadora de análisis derivado desde último (o seleccionado) `CreditReport`.
2. Página `/crm/clientes/[clientId]/plan-de-accion`.
3. Secciones 1–8 (UI); Descargar PDF del plan = follow-up.
4. Catálogo how-to prioridades + modales.
5. Cápsula Plan de Acción → esa ruta (no stub).

**AC Paso C**

- [x] Pantalla full con scores/utilización reales del reporte.
- [x] Prioridades con «Ver cómo solucionar».
- [x] Volver al hub.

### Paso D — Análisis + HISTORIAL (Fase 3)

1. Modal Análisis: agrupar `CreditItem` por tipo.
2. Chips HISTORIAL en header (selección `reportId` para plan/análisis/reporte).
3. Score Plan / Fondeo / Avance: pulir stubs (no bloqueante).

**AC Paso D**

- [x] Análisis muestra categorías con conteos reales.
- [x] HISTORIAL cambia el reporte activo del hub.

---

## 5. Orden de entrega sugerido

1. Fase 1 PDF (valor inmediato en venta). — hecho
2. Fase 2 Plan de Acción (diferenciador Fondify). — hecho
3. Fase 3 Análisis + HISTORIAL. — hecho
4. Export PDF del plan + Score/Fondeo con datos reales. — hecho (pixel-perfect Fondify sigue fuera de alcance)
