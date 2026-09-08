# ROADMAP — Orden de implementación

## Fase 0 — Auditoría

Objetivo:

Entender el proyecto existente sin modificarlo.

Entregables:

- CURRENT_STATE
- GAP_ANALYSIS
- MIGRATION_PLAN

---

## Fase 1 — Núcleo comercial

Construir:

```text
Lead
→ Follow-up
→ Conversion
→ Client
→ ServiceCase
→ Dashboard básico
```

### Demo de aceptación

Un lead llega desde Instagram, se registra, se programa llamada, se contacta, se convierte en cliente y se crea un expediente de reparación de crédito.

---

## Fase 2 — Operación diaria

Construir:

- Tasks
- Notes
- Activity Timeline
- Documents
- Next Action
- Due Dates

### Meta

Al abrir un expediente, Hugo debe saber en pocos segundos:

- qué ocurrió;
- qué toca hacer;
- cuándo toca hacerlo.

---

## Fase 3 — Reparación de crédito

Construir:

- CreditCase
- CreditReport
- CreditItem
- DisputeRound
- DisputeRoundItem
- Credit timeline

### Demo de aceptación

```text
Cliente
↓
Reporte inicial
↓
Items
↓
Ronda #1
↓
Items incluidos
↓
Marcar enviada
↓
Programar revisión
↓
Task
↓
Revisar resultado
↓
Nueva ronda si corresponde
↓
Finalizar
```

---

## Fase 4 — Ventas y cobranza

Construir:

- Quotes
- Contracts
- Payments
- Balance
- Payment History

---

## Fase 5 — Servicios secundarios

Construir:

- HomeBuyerCase
- FundingCase
- FundingApplication
- PersonalLoanCase
- ProjectCase

---

## Fase 6 — Testimonios

Construir:

- CRUD
- consentimiento
- aprobación
- publicación
- endpoint público

---

## Fase 7 — Automatizaciones

Después del MVP estable:

- email;
- webhook de website;
- SMS;
- WhatsApp;
- pagos online.

---

## Fase 8 — IA

Después de que los datos estén estructurados correctamente:

- resumen de expediente;
- siguiente acción sugerida;
- extracción de tareas desde notas;
- búsqueda asistida.
