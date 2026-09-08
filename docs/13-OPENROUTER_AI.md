# OPENROUTER AI — Arquitectura de IA dentro del CRM

## Principio

OpenRouter forma parte del producto, no del flujo principal de desarrollo.

No comenzar con un chatbot general.

Primero implementar funciones pequeñas y controlables.

## Estructura recomendada

```text
src/lib/ai/
├── client.ts
├── models.ts
├── prompts.ts
├── sanitize.ts
└── tasks/
    ├── summarize-case.ts
    ├── suggest-next-action.ts
    └── extract-note-actions.ts
```

## AI-001 — Resumen de expediente

Input estructurado:

```json
{
  "client": {},
  "case": {},
  "lastActivities": [],
  "tasks": [],
  "payments": []
}
```

La IA resume. No debe inventar datos.

## AI-002 — Siguiente acción sugerida

Debe mostrarse como:

```text
Sugerencia de IA
```

Nunca como una orden automática.

## AI-003 — Extraer tareas desde notas

Ejemplo:

Entrada:

```text
Hablé con María. Ya recibió respuesta de Experian,
falta Equifax y enviará documento mañana.
```

Salida propuesta:

```text
Activity
Task
Possible status update
```

El usuario debe confirmar antes de aplicar cambios.

## Sanitización

Crear:

```text
sanitizeForAI()
```

Debe eliminar, salvo necesidad explícita:

- SSN;
- ITIN;
- identificadores completos;
- DOB;
- dirección;
- números de cuenta;
- datos financieros no necesarios.

## Modelos

No acoplar componentes directamente a un model ID.

Usar una capa lógica por tarea.

Ejemplo:

```text
summarizeCase()
suggestNextAction()
extractNoteActions()
```

Luego `models.ts` resuelve qué modelo usar.

## Fallback

La implementación puede contemplar:

```text
modelo principal
↓ error
modelo fallback
↓ error
respuesta controlada
```

## Logging

Registrar:

- función IA;
- modelo usado;
- duración;
- resultado/error;
- nunca prompts crudos con PII sensible.
