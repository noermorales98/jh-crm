# Política de deduplicación de clientes (JH-004)

**Estado:** default de backlog para P1 (2026-10-15). Sin migración de producción en este PR.

## Identidad

| Señal | Regla |
|---|---|
| Correo | Clave primaria de dedupe: `normalizeImportEmail` = trim + lower-case, **por `organizationId`**. |
| Sin correo | No se crea (`no_email`). |
| Teléfono / nombre | No son claves de unicidad en v1 (solo ayuda humana / merge). |

## Comportamiento import CSV

1. **Preview:** clasifica `create` / `exists` / `duplicate_in_file` / `invalid` / `no_email` contra el snapshot de emails actuales.
2. **Commit:** solo inserta filas `create`. Antes de cada insert, **re-lee** el correo en la misma transacción; si apareció (carrera concurrente), se omite como `exists` y no aborta el lote.
3. **Dentro del archivo:** el segundo+ email idéntico → `duplicate_in_file` (no create).

## Concurrencia

- Dos imports simultáneos del mismo email: como máximo un create; el otro observa `exists` en el re-check.
- No se elimina ni fusiona automáticamente. Merge sigue siendo acción explícita de staff.

## Schema (no aplicado aquí)

Hoy: `@@index([organizationId, email])` sin unique.  
**Recomendado (PR futuro, migrate sandbox primero):** `@@unique([organizationId, email])` permitiendo múltiples `NULL` (MySQL). No correr migrate en prod desde este ticket.
