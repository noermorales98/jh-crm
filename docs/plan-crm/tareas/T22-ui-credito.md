# T22 · Integrar los módulos en una interfaz por buró y consolidada

[Volver al índice](../README.md) · [Estado](../ESTADO.md)

- **Módulo:** Frontend
- **Dependencias:** T12, T14, T18, T19, T21
- **Estado inicial:** PENDIENTE
- **Tipo de entrega:** implementación incremental sobre el repositorio real; código de este archivo es referencia a adaptar.

## Resultado buscado y contexto

Presentar resultados útiles y consistentes con la calidad del dato, con detalle accesible y mínimo scroll innecesario.

El hallazgo viene de la investigación adjunta. Verifica en el commit actual si sigue vigente; si ya existe una solución equivalente, demuéstralo con código y pruebas y registra qué trabajo falta.

## Archivos a localizar

Pantalla de cliente/credit case, gráficas, tabs de análisis, Action Center, Score Plan, Funding y exportes.

No se afirman rutas completas no verificadas. Usa MAPA-REAL de T00; actualízalo si cambia el punto de integración.

## Pasos de implementación

1. Mantener navegación y componentes de diseño existentes; organizar vista inicial con scores/modelos, utilización, alertas y próximas acciones.
2. Ofrecer por buró y consolidado con alcance/fecha visibles. Detalle de una cifra muestra observaciones, exclusiones y versión.
3. Usar DTOs de servicios; no recalcular balances/eligibilidad en React.
4. Implementar loading, empty, partial, unknown, error y stale, sin pintar UNKNOWN como verde o cero.
5. Gráficas accesibles con alternativa textual/tabla; tooltip por hover y acceso por clic/teclado/touch.
6. Revisar desktop/móvil y PDF, monedas, estados y mensajes. No agregar una estética nueva sin necesidad funcional.

## Código o contrato de implementación

```ts
type MetricView = {
  formattedValue: string | null;
  status: "KNOWN" | "PARTIAL" | "UNKNOWN" | "CONFLICT" | "STALE";
  label: string; asOf: string; detailsHref: string;
};
// El componente presenta status y valor del servidor, no vuelve a hacer la fórmula.
```

## Operaciones y significado de los datos

Redondear sólo presentación: 38.409...% puede verse 38.4%, conservando precisión para reglas. No mostrar 0% cuando value es null.

## Verificación concreta

Todos los estados, teclado, touch, pantallas angostas, snapshot viejo, conflicto y consistency UI/API/export.

Ejecuta las comprobaciones relevantes del repositorio detectadas en T00. Si el entorno impide un check, registra NO VERIFICADO y el motivo; no conviertas ese resultado en éxito.

## Criterios de aceptación

Cifras y significado coinciden en superficies; detalles alcanzables; no hay copy de aprobación o score futuro sin respaldo.

Guarda evidencia en `docs/plan-crm/evidencias/T22.md` con commit base, archivos, comandos y resultados. Actualiza ESTADO; no hay implementación realizada por el mero hecho de existir este documento.

## Recuperación

Flag de paneles por organización y vuelta al layout anterior compatible; mantener deshabilitadas salidas incorrectas.

## Prompt listo para Cursor

```text
Ejecuta T22 leyendo docs/plan-crm/README.md, ESTADO.md y
 tareas/T22-ui-credito.md dentro de docs/plan-crm.
Comprueba dependencias: T12, T14, T18, T19, T21. Localiza código real y contrasta el hallazgo.
Implementa sólo esta tarea siguiendo contratos, pruebas y recuperación descritos.
No inventes rutas, campos, hechos financieros ni datos ausentes. Preserva scope,
procedencia e histórico. Usa los ejemplos como referencia, no como reemplazo del
schema o stack actual. Verifica resultados, revisa el diff, registra evidencia en
 docs/plan-crm/evidencias/T22.md y actualiza ESTADO con límites pendientes.
No continúes automáticamente a otra tarea.
```

## Referencias necesarias

[ARQUITECTURA](../referencias/ARQUITECTURA.md) · [QA-Y-ACEPTACION](../referencias/QA-Y-ACEPTACION.md)
