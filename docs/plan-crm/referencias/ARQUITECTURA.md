# Arquitectura y límites de implementación

[Volver al índice](../README.md)

## Evidencia y alcance

La investigación original describe `Client → ServiceCase → CreditCase → CreditReport/CreditItem/CreditRound`. También menciona `action-plan.ts`, `funding-estimate.ts`, un importador y CI. Son referencias heredadas, no rutas completas verificadas de este paquete. T00 debe ubicar sus equivalentes y documentar el commit actual.

Se preservan los modelos existentes. Se añade identidad canónica y observaciones históricas sin eliminar el origen importado. Ningún fragmento Prisma de este paquete reemplaza el esquema real.

## Servicios propuestos

| Capa | Responsabilidad | Salida |
|---|---|---|
| Importación | Extraer texto/OCR, redactar PII, validar esquema y cobertura | Propuesta de importación |
| Normalización | Convertir tipos, importes, fechas y ownership | Observaciones normalizadas |
| Identidad | Relacionar observaciones con la misma cuenta real | Coincidencias explicadas/revisadas |
| Snapshot | Seleccionar datos confirmados a una fecha y versión | Vista reproducible con procedencia |
| Métricas | Utilización, edades, consultas, conteos | Valor + calidad + cobertura |
| Recomendaciones | Priorizar acciones explicables | Acciones con motivos y seguimiento |
| Programas | Evaluar reglas de producto vigentes | PASS/FAIL/UNKNOWN por requisito |
| Disputas | Registrar afirmación, evidencia, revisión, envío y respuesta | Expediente trazable |
| Comparación | Describir cambios entre snapshots compatibles | Cambio observado sin causalidad inventada |

Propuesta de ubicación, a adaptar en T00: `src/lib/credit/domain/`, `normalization/`, `metrics/`, `funding/`, `disputes/`. Rutas/API existentes delegan al servicio; React presenta DTOs. Evitar duplicar fórmulas en componentes y server actions.

## Invariantes

- Toda identidad y consulta conserva `organizationId`, `clientId` y expediente cuando corresponda. El contexto autenticado del servidor define la organización; el body no la concede.
- Una observación pertenece a un reporte, buró, fuente y momento. La cuenta canónica no es el lugar para sobrescribir balances históricos.
- Un reporte confirmado es inmutable para reproducir resultados. Una corrección crea revisión nueva y registra autor/motivo.
- Balance, límite, estado y fecha de una vista por cuenta provienen de la misma observación elegida. No combinar el límite de un buró con el balance de otro sin política explícita y etiqueta.
- Vista por buró usa sólo ese buró. Vista consolidada usa una observación seleccionada por cuenta, con política versionada, cobertura y divergencias visibles.
- Estado faltante, parcial, conflictivo, obsoleto e inválido se representan; ninguno equivale a cero ni a aprobación.
- IA propone extracción o redacción. Servicios deterministas hacen cuentas y reglas. No generar disputas ni cobros porque lo diga un modelo.

## Política de snapshot propuesta v1

Entrada: organización, cliente, expediente, reportes confirmados seleccionados, `asOf`, versión de política. Excluir datos con fecha efectiva posterior a `asOf`. No completar silenciosamente un reporte parcial con observaciones viejas.

Por cuenta: elegir observación confirmada más reciente dentro del conjunto seleccionado, ordenada por `dateReported`, luego fecha del reporte y desempate de prioridad explícita de buró. Fechas faltantes reducen calidad; no fingir que fecha de importación es fecha de reporte. Si dos candidatas igualmente recientes discrepan materialmente y no hay revisión, devolver conflicto en los campos afectados.

La prioridad es una convención operativa J&H, no el dato que «usa FICO». Guardar IDs seleccionados y razones. Mostrar detalles por buró permite evaluar divergencias sin forzar un único dato.

## Contrato de respuesta sugerido

```ts
type Metric<T> = {
  value: T | null;
  status: "KNOWN" | "PARTIAL" | "UNKNOWN" | "CONFLICT" | "STALE";
  reasonCodes: string[];
  includedObservationIds: string[];
  excluded: { id: string; reason: string }[];
  asOf: string;
  policyVersion: string;
};
```

`KNOWN` expresa cobertura según el contrato, no certeza universal sobre la realidad. Un subconjunto con datos válidos puede tener un subtotal conocido y seguir siendo una métrica global parcial. La preparación para un programa no debe usar ese subtotal como si fuera el total.

## Actualizaciones y concurrencia

Confirmación atómica con control de versión; repetir una confirmación no duplica snapshots. Jobs de importación usan idempotencia y estados explícitos. La caché incluye organización, cliente, snapshot, versión de reglas y política. Invalidar derivados ante revisión nueva. Nunca cachear por cliente sin scope de organización.
