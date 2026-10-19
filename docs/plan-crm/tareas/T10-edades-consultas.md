# T10 · Calcular antigüedad y consultas con contexto temporal

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Estructura
- **Dependencias:** T03, T08
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Reemplazar contadores y umbrales aislados por métricas temporales descriptivas y trazables.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

OldestAge, dateOpened, contador de inquiries, buró y reportes históricos; políticas de agrupación.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Calcular edad por cuenta canónica al asOf del snapshot, no usando la fecha de hoy en reportes viejos.
2. Mostrar oldest/newest/AAoA con universo y cobertura. Definir inclusión de cerradas y AU por vista.
3. Guardar consultas individuales cuando existan; mantener agregados legacy como tales sin inventar fechas.
4. Contar HARD por ventana explícita usando fecha y buró; SOFT no entra, UNKNOWN no se transforma en HARD.
5. Rate shopping sólo como agrupación informativa hasta contar con modelo/ventana documentados aplicables. Conservar conteo bruto y grupos separados.
6. No afirmar que cuatro inquiries implican rechazo universal ni que la falta de apertura satisface una regla de edad.

## Código o contrato de implementación

```ts
type TemporalMetrics = {
  asOf: string; ageCoverage: { known: number; total: number };
  oldestMonths: number | null; newestMonths: number | null;
  averageKnownMonths: number | null;
  hardRawCount: number | null; groupedInformationalCount: number | null;
  windowStart: string; groupingPolicyVersion: string | null;
};
```

## Operaciones y significado de los datos

Edades 120+60+12 =192; AAoA=192/3=64 meses. Ventana [asOf−N meses, asOf] con política de fechas civiles. Un dato futuro es inválido, no edad negativa.

## Verificación concreta

Fecha de apertura parcial, futura y ausente; leap day; closed/AU con alcance explícito; SOFT; contador legacy; agrupación sin modelo.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Métricas reproducibles a asOf, cobertura visible y consultas brutas preservadas. Ninguna ausencia produce PASS por defecto.

Guarda evidencia en `docs/plan-crm/evidencias/T10.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Desactivar agrupación y mostrar únicamente datos brutos/edades conocidas con cobertura. Mantener nuevos registros para auditoría.

## Prompt listo para Cursor

```text
Ejecuta T10 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T10-edades-consultas.md dentro de docs/plan-crm.
Comprueba dependencias: T03, T08. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T10.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[MATEMATICAS](../referencias/MATEMATICAS.md) · [CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md)
