# AI CONTEXT — Contexto compacto para ChatGPT / Cursor / Kimi / Grok

## Proyecto

CRM para JH Financial.

Usuario principal: Hugo.

Servicio principal: reparación de crédito.

Stack:

```text
Next.js
Vercel
MySQL / Hostinger
OpenRouter
```

**Fuente canónica de arquitectura:** `docs/ARCHITECTURE_V1.md`.

Si hay conflicto con otros docs, gana ARCHITECTURE_V1.

## Regla arquitectónica principal

NO crear tabla `Lead`.

NO modelar:

```text
Client
- service
- serviceStatus
- currentRound
- stage   (de trabajo)
```

Modelar:

```text
Client                    persona / contacto
  ├── Opportunity[]       pipeline comercial (UI: Leads)
  └── ServiceCase[]
        ├── stageId → WorkflowStage (del Service)
        ├── nextActionAt
        └── CreditCase? 1:1 si CREDIT_REPAIR
              ├── CreditReport[]
              ├── CreditItem[]
              └── CreditRound[]      (no rename)
                    └── DisputeItem[]
```

`WorkflowStage` es la única fuente de stage. Prohibido `ServiceCase.stage` string.

## Relojes (no mezclar)

```text
Opportunity.nextFollowUpAt   → pre-venta
ServiceCase.nextActionAt     → operación del servicio
Task.dueAt                   → una tarea
CreditCase.nextReviewAt      → legado; deprecar escritura, no DROP
```

## Prioridad

1. ServiceCase envolviendo CreditCase (dos deploys, aditivo)
2. Leads UI sobre Opportunity
3. markOpportunityWon transaccional
4. WorkflowStage por Service
5. Notes nuevas + StageHistory nueva (sin backfill histórico)
6. Tasks / nextActionAt / dashboard
7. Documents
8. Credit Repair existente (conservar; no reescribir)
9. Quotes / Payments (balance a nivel expediente)
10. Secondary Services
11. Testimonials
12. Automations
13. AI (con sanitizeForAI)

## Conservar (no reescribir)

CreditCase, CreditRound, CreditReport, CreditItem, DisputeItem, Letters, Comparisons, ProgressReports, Opportunity.

## Prohibido en v1

- tabla Lead;
- dual-write prolongado;
- DROP;
- rename de CreditCase / CreditRound;
- borrar Opportunity;
- backfill automático ActivityLog.NOTE → Note;
- reconstruir StageHistory desde ActivityLog.

## Reglas críticas

- Un cliente puede tener varios ServiceCase.
- Cada servicio tiene su propio status y stageId.
- Rondas ilimitadas (`CreditRound.roundNumber`).
- Nunca crear ronda automática cada 30/40 días.
- `sentAt` + `expectedReviewAt` → Task + `ServiceCase.nextActionAt`.
- Separar Note y Activity.
- No almacenar binarios en MySQL.
- Documentos privados.
- SSN/ITIN enmascarados.
- No eliminaciones destructivas comunes.
- OpenRouter debe recibir datos sanitizados.

## Comportamiento esperado de la IA de desarrollo

Antes de modificar código:

1. leer `ARCHITECTURE_V1.md` y `/docs`;
2. respetar `BUSINESS_RULES`;
3. trabajar un ticket a la vez;
4. evitar features fuera del backlog;
5. indicar migraciones (aditivas, dos deploys);
6. no tocar producción;
7. no ejecutar cambios destructivos sin aprobación;
8. no cambiar `schema.prisma` ni crear migrations salvo que el ticket lo pida explícitamente.
