# MIGRATION PLAN — Plan de migración

> No ejecutar sobre producción hasta probar en staging.

## 1. Objetivo

Migrar del modelo actual al modelo:

```text
Lead
→ Client
→ ServiceCase
```

sin perder datos.

## 2. Precondiciones

- backup;
- schema auditado;
- datos existentes cuantificados;
- staging disponible;
- rollback documentado.

## 3. Cambios de schema

### Crear

- PENDIENTE

### Alterar

- PENDIENTE

### Deprecar

- PENDIENTE

## 4. Migración de Client.service

Si existe:

```text
Client.service
```

migrar hacia:

```text
ServiceCase
```

Proceso propuesto:

1. crear catálogo `Service`;
2. crear `ServiceCase` para cada servicio existente;
3. enlazar con Client;
4. validar conteos;
5. deprecar columnas antiguas;
6. no eliminarlas hasta validar.

## 5. Rondas existentes

Si existen:

```text
round1Date
round2Date
round3Date
```

migrar a:

```text
DisputeRound[]
```

## 6. Validaciones post-migración

- conteo de clientes;
- conteo de leads;
- servicios por cliente;
- pagos;
- documentos;
- rondas;
- actividades.

## 7. Rollback

- PENDIENTE

## 8. Checklist producción

```text
[ ] Backup
[ ] Staging migrado
[ ] QA aprobado
[ ] Queries revisadas
[ ] Rollback probado
[ ] Ventana de despliegue definida
[ ] Migración aprobada manualmente
```
