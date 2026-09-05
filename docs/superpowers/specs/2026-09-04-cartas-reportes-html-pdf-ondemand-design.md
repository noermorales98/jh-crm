# Cartas y reportes: vista HTML + PDF on-demand (sin S3)

Fecha: 2026-09-04  
Proyecto: J&H CRM (`jh-crm`)  
Estado: diseño aprobado; implementación aplicada (2026-09-04)

## Problema

Al finalizar una carta o generar un reporte de progreso se crea un PDF, se sube a S3 y se enlaza como `Document`. Eso genera archivos “basura” antes de que el usuario decida descargarlos, y la “previsualización” depende de un binario PDF (a menudo sin extensión usable).

El usuario quiere:

1. **Ver** el contenido en **HTML** dentro del CRM (no como archivo PDF).
2. **Descargar PDF** solo cuando lo pida; el archivo llega al navegador y **no** se guarda en S3.
3. En la nube / BD: el contenido como datos (texto/HTML tipográfico), convertible a PDF al vuelo.

## Decisiones cerradas

| Tema | Decisión |
| --- | --- |
| Alcance | Solo **cartas de disputa** y **reportes de progreso**. Cotizaciones y recibos no cambian. |
| Vista | HTML tipográfico en el CRM. |
| Descarga PDF | Servidor genera PDF **on-demand** (`Content-Disposition: attachment`), **sin** `putObject` / S3. |
| Almacenamiento | Solo **base de datos** (sin `Document` nuevo ni HTML en S3). |
| Reporte | Al generar: crear snapshot en BD, abrir vista HTML, y dejar **historial** en ronda y en Crédito. |
| Enfoque técnico | Snapshot en BD + render HTML + jsPDF on-demand (enfoque 1). No Puppeteer ni `window.print` como descarga oficial. |
| PDFs históricos | No borrar los ya subidos a S3. Cartas antiguas con `documentId` siguen pudiendo abrir el archivo legacy; las **nuevas** no crean `Document`. |

## Fuera de alcance

- Cotizaciones, recibos y otros PDFs del CRM.
- Borrado / migración masiva de PDFs de cartas/reportes ya en S3.
- Edición WYSIWYG rica (HTML libre); el cuerpo de carta sigue siendo texto con tipografía en la vista.
- Motor HTML→PDF (Puppeteer/Playwright).
- Nueva categoría `DocumentCategory` para progreso (ya no se usa `Document` para esto).

## Arquitectura

```text
[UI Ver] → carga DisputeLetter / ClientProgressReport → componente HTML tipográfico
[UI Descargar PDF] → GET API → jsPDF desde los mismos campos → stream attachment → fin (sin S3)

[Confirmar final carta] → status FINAL (+ finalizedAt); NO Document, NO putObject
[Generar reporte] → INSERT ClientProgressReport → redirect/open vista HTML + aparece en historial
```

Fuente de verdad compartida entre vista HTML y PDF:

- **Carta:** `recipient`, `subjectSnapshot`, `contentSnapshot`, `bureau`, datos de org/cliente/caso/ronda.
- **Reporte:** campos del modelo `ClientProgressReport` (snapshot congelado al generar).

## Modelo de datos

### DisputeLetter (cambios de comportamiento)

Sin migración obligatoria de columnas.

- `finalizeLetter`: deja de llamar a `putObjectBytes` y de crear `Document`. Solo actualiza status a `FINAL`, `finalizedAt`, activity log, sync de contadores.
- `documentId`: permanece nullable. Se rellena solo en cartas legacy. UI nueva: “Ver” → HTML; “Descargar PDF” → ruta on-demand. Si existe `documentId` legacy, se puede ofrecer “PDF archivado (legacy)” aparte, opcional y secundario.
- Smoke / tests: dejan de exigir `documentId` tras finalize.

### ClientProgressReport (nuevo)

Tabla nueva, p. ej.:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `id` | cuid | |
| `organizationId` | string | multi-tenant |
| `caseId` | string | |
| `roundId` | string? | opcional |
| `createdById` | string? | usuario que generó |
| `clientName` | string | snapshot |
| `caseCode` | string | snapshot |
| `periodLabel` | string | p. ej. `MM/dd/yyyy – MM/dd/yyyy` |
| `roundLabel` | string | |
| `reportDate` | DateTime | momento del snapshot |
| `scoresJson` | Json | `[{ bureau, score, delta }]` |
| `resultsJson` | Json | `{ deleted, updated, pending, verified? }` |
| `resultLinesJson` | Json | `string[]` |
| `nextSteps` | Text | |
| `nextReviewAt` | DateTime? | |
| `createdAt` / `updatedAt` | DateTime | |

Índices: `(organizationId, caseId, createdAt)`, `(roundId, createdAt)`.

Relaciones: `Organization`, `CreditCase`, `CreditRound?`, `User?`.

Migración Prisma **aditiva** (sin `db push` destructivo).

## Vista HTML

### Cartas

- Ruta: `/crm/casos/[caseId]/rondas/[roundId]/cartas/[letterId]`
- Contenido: membrete (nombre legal org, contacto), destinatario, fecha, asunto, cuerpo (`contentSnapshot` con saltos de línea → párrafos), disclaimer breve.
- Acciones: “Descargar PDF”; si status `FINAL`, “Marcar enviada” (como hoy).
- Permisos: `letters.view` para ver; `letters.manage` para finalizar/enviar.

### Reportes de progreso

- Ruta: `/crm/casos/[caseId]/reportes/[reportId]`
- Mismos bloques que el PDF actual: cliente, periodo, ronda, puntajes, resultados, detalle, próxima revisión, próximos pasos, disclaimer.
- Historial:
  - En detalle de **ronda**: lista de reportes con ese `roundId` + CTA “Generar reporte”.
  - En pestaña **Crédito**: lista de reportes del caso + CTA generar (round opcional).
- Permisos: `letters.view` / `letters.manage` (mismos que el CTA actual; sin permiso nuevo en esta iteración).

## API de descarga PDF

| Ruta | Entrada | Salida |
| --- | --- | --- |
| `GET /api/letters/[letterId]/pdf` | sesión + org + permiso | `application/pdf` attachment, filename con `.pdf` |
| `GET /api/progress-reports/[reportId]/pdf` | sesión + org + permiso | igual |

Comportamiento:

1. `requireApiOrganization` + permiso correspondiente.
2. Cargar entidad filtrando `organizationId`.
3. Cargar settings de org para membrete.
4. Llamar `generateDisputeLetterPdf` / `generateClientProgressPdf` (adaptando inputs desde snapshot).
5. Responder con bytes, headers:
   - `Content-Type: application/pdf`
   - `Content-Disposition: attachment; filename="....pdf"`
6. **No** escribir a S3. **No** crear `Document`.

Auditoría (opcional pero recomendada): activity o audit `LETTER_PDF_DOWNLOADED` / `PROGRESS_REPORT_PDF_DOWNLOADED` sin almacenar el binario.

## Cambios de UI / acciones existentes

| Hoy | Nuevo |
| --- | --- |
| `LetterActions` “Confirmar final + PDF” | “Confirmar final” (sin PDF en S3) |
| “Ver PDF” → `/api/files/.../download?inline=1` | “Ver” → ruta HTML; “Descargar PDF” → `/api/letters/.../pdf` |
| `GenerateProgressReportButton` genera PDF + Document + `window.open` download | Crea `ClientProgressReport`, cierra modal, navega/abre vista HTML |
| Lista de documentos del expediente | Ya no recibe reportes/cartas nuevas como PDF |

## Generadores PDF

- Reutilizar `src/lib/pdf/dispute-letter.ts` y `src/lib/pdf/client-progress.ts`.
- Ajustar firmas si hace falta para consumir snapshot del reporte (mismos campos que la vista HTML).
- Layout del periodo: mantener formato compacto y bloques etiqueta/valor ya corregidos (sin texto derecho estirado).

## Errores y edge cases

- Carta `DRAFT` / `READY_FOR_REVIEW`: se puede ver HTML; descargar PDF permitido (útil para revisión) o restringir descarga a `FINAL`+ — **decisión:** permitir descarga en cualquier status excepto `CANCELLED`.
- Carta `CANCELLED`: ver solo lectura; sin descarga (404/403).
- Reporte sin ronda: válido; historial en Crédito; en ronda solo aparecen los de ese `roundId`.
- S3 no configurado: **ya no bloquea** finalize ni generar reporte (porque no hay upload). Solo afecta documentos subidos por el usuario y legacy.

## Pruebas

- Actualizar `scripts/smoke/letters-smoke.ts`: finalize sin `documentId`; opcionalmente invocar generación PDF en memoria (función lib) sin HTTP.
- Nuevo smoke o extensión: crear `ClientProgressReport`, listar por caso, generar buffer PDF desde snapshot.
- `tsc` / lint / build tras migración.

## Criterios de éxito

1. Tras “Confirmar final”, no hay objeto nuevo en S3 ni `Document` nuevo para esa carta.
2. “Ver” muestra HTML legible en el CRM sin descargar nada.
3. “Descargar PDF” entrega un `.pdf` local generado al vuelo.
4. Generar reporte crea una fila en historial reabrible; no crea `Document`.
5. Cotizaciones/recibos y upload de expediente siguen igual.

## Orden de implementación sugerido

1. Modelo `ClientProgressReport` + migración + servicio list/create/get.
2. Dejar de persistir PDF en `finalizeLetter` y en generate progress (sustituir por create snapshot).
3. Páginas HTML de carta y reporte + enlaces en ronda/crédito.
4. Rutas API PDF on-demand + botones Descargar.
5. Smoke + limpieza de copy UI (“+ PDF”, “Ver PDF” → “Ver” / “Descargar PDF”).
