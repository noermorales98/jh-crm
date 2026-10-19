# T04 · Normalizar acreedores, cuentas, importes y fechas

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Normalización
- **Dependencias:** T02
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Convertir observaciones heterogéneas en datos tipados sin inferir hechos ausentes.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Extractores actuales, utilidades de normalización y catálogos de account type/ownership; mapper hacia Prisma.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Crear adaptadores por proveedor/formato con locale conocido; preservar raw protegido y locator.
2. Mapear ownership explícito; regex de AU sólo genera INFERRED y requiere confirmación.
3. Clasificar REVOLVING, INSTALLMENT, MORTGAGE, CHARGE, COLLECTION y UNKNOWN por evidencia. Que exista balance no prueba revolving.
4. Usar alias de acreedor versionados; distinguir emisor, collector y original creditor.
5. Normalizar dinero y fechas conservando precisión y errores. No inventar día, fecha de apertura o credit limit desde high balance.
6. Emitir advertencias estructuradas para corrección manual y mantener el historial original.

## Código o contrato de implementación

```ts
type NormalizedAccount = {
  rawItemId: string;
  family: "REVOLVING" | "INSTALLMENT" | "MORTGAGE" | "CHARGE" | "COLLECTION" | "OTHER" | "UNKNOWN";
  ownership: "INDIVIDUAL" | "JOINT" | "COSIGNER" | "AUTHORIZED_USER" | "UNKNOWN";
  balanceCents: number | null; limitCents: number | null;
  currency: string | null; warnings: string[];
  normalizerVersion: string;
};
```

## Operaciones y significado de los datos

`$1,234.56` con locale en-US → 123456 centavos; `1.234,56` sólo con locale compatible. Fecha «06/2020» conserva precisión MONTH. Negative balance se conserva como raw y se trata por política, no como dato inválido silenciosamente.

## Verificación concreta

Mortgage con balance no entra en revolving; AU regex no se confirma sola; NULL/0 y locale ambiguo; alias no mezcla dos tarjetas.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Funciones puras y versionadas con fixtures por formato; ningún raw se sobrescribe; errores y campos inferidos visibles a revisión.

Guarda evidencia en `docs/plan-crm/evidencias/T04.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Usar versión previa del normalizador para nuevas propuestas si falla; no modificar snapshots confirmados por reejecutar una normalización.

## Prompt listo para Cursor

```text
Ejecuta T04 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T04-normalizacion.md dentro de docs/plan-crm.
Comprueba dependencias: T02. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T04.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
