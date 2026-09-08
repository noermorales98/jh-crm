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

## Regla arquitectónica principal

NO modelar:

```text
Client
- service
- serviceStatus
- currentRound
```

Modelar:

```text
Client
  └── ServiceCase[]
```

Y para reparación:

```text
ServiceCase
  └── CreditCase
        ├── CreditReport[]
        ├── CreditItem[]
        └── DisputeRound[]
              └── DisputeRoundItem[]
```

## Prioridad

1. Leads
2. Clients
3. ServiceCase
4. Tasks / Next Action
5. Activity Timeline
6. Documents
7. Credit Repair
8. Dispute Rounds
9. Quotes / Payments
10. Secondary Services
11. Testimonials
12. Automations
13. AI

## Reglas críticas

- Un cliente puede tener varios servicios.
- Cada servicio tiene su propio estado y etapa.
- Rondas ilimitadas/configurables.
- Nunca crear ronda automática cada 30/40 días.
- `sentAt` + `expectedReviewAt` deben generar seguimiento.
- Separar Note y Activity.
- No almacenar binarios en MySQL.
- Documentos privados.
- SSN/ITIN enmascarados.
- No hacer eliminaciones destructivas comunes.
- OpenRouter debe recibir datos sanitizados.

## Comportamiento esperado de la IA de desarrollo

Antes de modificar código:

1. leer `/docs`;
2. respetar `BUSINESS_RULES`;
3. trabajar un ticket a la vez;
4. evitar features fuera del backlog;
5. indicar migraciones;
6. no tocar producción;
7. no ejecutar cambios destructivos sin aprobación.
