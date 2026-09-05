# Design: Qué sigue (caso) + Progreso real (portal)

**Fecha:** 2026-09-05  
**Estado:** aprobado por el usuario (2026-09-05)
**Alcance:** pulir lo existente (solo / casi solo operador). Fase 1 en paralelo: CRM caso + portal.

## Contexto

Operador único (o 1–2 personas). Prioridad: **casos/rondas/cartas** y **portal del cliente**.  
Referencia de mercado (CRC, CDM, etc.): “siguiente paso” claro y progreso comprensible para el cliente — sin copiar marketplace, afiliados ni cobro online.

Hoy:
- El **Resumen del caso** muestra etapa, próxima revisión e historial, pero **no** un “qué sigue” operativo.
- **Portal → Progreso** duplica casi el **Inicio**; no muestra el último reporte de progreso ni `nextSteps`.
- **Portal → Reportes** lista snapshots **sin** Ver/PDF (sí existen en CRM).

## Objetivos

1. En el CRM, al abrir un caso, saber en **≤3 segundos** qué hacer después.
2. En el portal, que el cliente vea **progreso real** (no el mismo resumen dos veces) y pueda **leer/descargar** reportes.
3. Reutilizar datos y rutas existentes; cero módulos nuevos de navegación.

## No objetivos (fase 1)

- Wizard masivo de disputas / envío postal automatizado.
- Cobro con tarjeta / Stripe real.
- Apps móviles.
- Cambiar el modelo de etapas o MFA.
- Rediseño total del CRM.

## Enfoque

**A — “Siguiente paso” + progreso real** (aprobado).

---

## Diseño — CRM: card “Qué sigue”

### Dónde

`CaseDetailPanel` (Resumen del caso), **arriba** de “Estado del proceso” (o como primera card de la columna izquierda).

### Contenido

Hasta **3** ítems priorizados, cada uno con:
- Título corto en español
- Una línea de contexto (opcional)
- CTA (link) al lugar correcto

### Reglas de prioridad (primera que aplique gana slots)

1. Caso **cerrado / pausado** → mensaje informativo, sin CTAs de trabajo.
2. `nextReviewAt` **vencida** → “Revisión vencida” → ancla al formulario de próxima revisión / mismo resumen.
3. Ronda activa en estado que requiera acción (p. ej. borrador / en preparación / esperando envío — según estados reales del enum) → “Continuar ronda #N” → `/crm/casos/{id}/rondas/{roundId}`.
4. Ronda activa con **cartas en borrador / pendientes de revisión** → “Revisar cartas de la ronda” → detalle de ronda.
5. Caso abierto **sin ronda** → “Crear o abrir primera ronda” → tab/lista de rondas.
6. Hay **último ClientProgressReport** → “Ver último reporte de progreso” → ruta CRM del reporte (si existe) o ronda asociada.
7. Si no hay nada urgente → “Todo al día” + próxima revisión si existe.

Exactitud de estados: implementar contra `ROUND_STATUS` / estados de carta ya usados en labels; no inventar estados nuevos.

### Datos

Helper server-side (p. ej. `getCaseNextSteps(ctx, caseId)`) que lea:
- caso (`state`, `nextReviewAt`)
- ronda más reciente / activa
- conteo ligero de cartas pendientes (si el costo es bajo; si no, solo estado de ronda)

Sin N+1 pesados: una query de caso+ronda y, si hace falta, un `count` de cartas.

### UI

- Card con título **“Qué sigue”**
- Lista compacta (no dashboard de KPIs)
- Lenguaje no técnico (evitar enums crudos)

---

## Diseño — Portal

### Inicio (`/portal`)

Mantener rol: saludo, caso activo (código, etapa, scores), contratos por firmar.  
Ajustes menores de claridad (pills, “próxima revisión” con aviso si vencida), sin cambiar la estructura.

### Progreso (`/portal/progreso`) — cambiar de verdad

Dejar de llamar solo a `getPortalHome` como espejo del inicio.

Mostrar, si hay caso activo:
1. **Último reporte de progreso** del cliente (más reciente por `reportDate` / `createdAt`):
   - Periodo / fecha
   - Scores (y deltas si ya están en el snapshot)
   - Resultados en español (traducir outcomes: DELETED → Eliminado, etc.)
   - **Próximos pasos** (`nextSteps` del snapshot) en lenguaje cliente
   - Próxima revisión del snapshot o del caso
2. Si **no** hay reportes: empty state amable (“Tu asesor publicará el progreso aquí”) + etapa/ronda actuales en una línea.

API: extender `listPortalProgressReports` o añadir `getLatestPortalProgressReport` que incluya campos del snapshot necesarios (summary/nextSteps/scores/resultLines según schema actual), **solo** lo que el cliente debe ver (nada interno de staff).

### Reportes (`/portal/reportes`)

- Columna o acciones: **Ver** (página o modal de solo lectura) y **PDF** (`/api/progress-reports/[id]/pdf` con auth portal).
- Auth: la ruta PDF debe aceptar sesión portal del dueño del reporte (si hoy solo staff, ampliar guard).

### Nav portal

Marcar ítem activo (`aria-current` / estilo) según pathname.

---

## Traducciones

Reutilizar / extender `labelFor` + labels de outcomes de disputa ya usados en CRM para el portal (no mostrar `DELETED` crudo).

---

## Criterios de éxito

- [ ] En un caso OPEN con ronda activa, Resumen muestra al menos un ítem “Qué sigue” con CTA que lleva a la ronda o revisión.
- [ ] `/portal/progreso` no es un clon de `/portal`; si hay reporte, se ven próximos pasos.
- [ ] Desde `/portal/reportes` el cliente puede abrir vista y/o PDF de un reporte suyo.
- [ ] Nav portal indica la sección actual.
- [ ] Sin nuevas entradas en el menú Más / sidebar CRM.

## Fuera de fase 1 (siguiente)

- PDF de contratos firmados.
- Biblioteca/wizard masivo de cartas.
- Contador “Reportes” en tabs del caso.
- SMS al cliente.

## Riesgos

- Exponer demasiado del snapshot interno al portal → filtrar campos.
- PDF portal sin auth correcta → revisar guard de la API.
- “Qué sigue” incorrecto si la ronda “activa” está mal definida → documentar regla (última ronda no cancelada / status in …).
