# T12 · Convertir AU en análisis descriptivo separado

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Authorized User
- **Dependencias:** T11
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Mostrar responsabilidad y efectos posibles sin recomendar cantidades o montos AU arbitrarios.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Estrategia AU, regex, recomendaciones del catálogo, límites combinados y UI de ownership.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Usar ownership confirmado en observación, no detección exclusiva por texto del acreedor.
2. Mostrar cuentas AU únicas con antigüedad, balance, límite, utilización y estados reportados.
3. Separar totales propios, joint y con AU; no presentar límite AU como capacidad personal garantizada.
4. Mostrar conflicto de responsabilidad entre burós para revisión. Evitar sobrescribir ownership histórico.
5. Retirar «máximo 3», «agrega AU ≥15k» y proyecciones de puntos. No automatizar compra de tradelines.
6. Mantener fuente y fecha para que staff pueda explicar cada clasificación.

## Código o contrato de implementación

```ts
type OwnershipSummary = {
  primaryCanonicalIds: string[]; jointCanonicalIds: string[];
  auCanonicalIds: string[]; unresolvedCanonicalIds: string[];
};
// Totales se calculan con el motor T11 para cada conjunto, no con nuevas fórmulas.
```

## Operaciones y significado de los datos

Primarias: 22k límite y 8,450 saldo → 38.409...%. AU: 15k/300. Con AU: 37k/8,750 →23.648...%. Se muestran dos vistas con distinto alcance, no un cambio garantizado de score.

## Verificación concreta

Una AU en 3 burós cuenta 1; INDIVIDUAL vs AU contradictorio; ownership desconocido; historial AU negativo; separación en export.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Panel AU describe hechos y riesgos con datos confirmados; sin recomendación fija ni mezcla silenciosa de ownership.

Guarda evidencia en `docs/plan-crm/evidencias/T12.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Retirar panel nuevo si falla; conservar clasificación y mostrar detalle original con estado pendiente.

## Prompt listo para Cursor

```text
Ejecuta T12 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T12-usuarios-autorizados.md dentro de docs/plan-crm.
Comprueba dependencias: T11. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T12.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[CONTRATOS-DE-DATOS](../referencias/CONTRATOS-DE-DATOS.md) · [MATEMATICAS](../referencias/MATEMATICAS.md)
