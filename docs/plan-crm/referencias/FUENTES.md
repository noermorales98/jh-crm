# Fuentes y trazabilidad

[Volver al índice](../README.md)

Consulta realizada: **19 de octubre de 2026**. Las páginas oficiales se verificaron para esta preparación. Los hallazgos de código se heredan del informe adjunto; no se volvió a auditar GitHub en esta entrega.

## Documentación consultada para el método de trabajo

| ID | Fuente primaria | Aplicación |
|---|---|---|
| C1 | [Cursor — Rules](https://cursor.com/docs/rules) | Formato y activación de reglas, AGENTS.md |
| C2 | [Cursor — Best practices for coding with agents](https://cursor.com/blog/agent-best-practices) | Contexto, planificación y validación |
| C3 | [Cursor — Plan Mode](https://cursor.com/docs/agent/plan-mode) | Preparación de cambios complejos |
| C4 | [Anthropic — Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Continuidad entre sesiones y avance incremental |

La selección de tareas, políticas de identidad, snapshots, fórmulas de redondeo y criterios de aceptación es una propuesta de ingeniería para J&H. No atribuir esos detalles a Cursor o Anthropic.

## Fuentes primarias de dominio comprobadas

| ID | Fuente | Uso delimitado |
|---|---|---|
| D1 | [CFPB — What is a debt-to-income ratio?](https://www.consumerfinance.gov/ask-cfpb/what-is-a-debt-to-income-ratio-en-1791/) | DTI = deuda mensual / ingreso bruto mensual; límites varían por producto/prestamista |
| D2 | [CFPB — How do I dispute an error on my credit report?](https://www.consumerfinance.gov/ask-cfpb/how-do-i-dispute-an-error-on-my-credit-report-en-314/) | Registrar error, explicación, documentos y resultado; no generar hechos |
| D3 | [myFICO — Amounts owed](https://www.myfico.com/credit-education/credit-scores/amount-of-debt) | Utilización revolving y diferencia entre saldo reportado y saldo actual |
| D4 | [FTC — Credit Repair Organizations Act](https://www.ftc.gov/legal-library/browse/statutes/credit-repair-organizations-act) | Punto de entrada oficial para revisión jurídica del flujo de servicios de reparación |

No se fija un plazo legal general, ventana universal de rate shopping, mínimo FICO o calendario de cobros. El plan exige políticas aplicables verificadas antes de activar esas funciones. DSCR se trata como una definición contractual del programa; no existe un mínimo único propuesto aquí.

## Investigación original

[Archivo completo](../fuentes/investigacion-original.md). Se conserva sin alterar para no perder contenido. Sus identificadores internos de cita (`turn...`) dependen de la sesión original y pueden no funcionar fuera de ChatGPT; no equivalen a rutas o fuentes verificadas por Cursor. El contenido se usa como entrada de planificación, no como prueba de que el HEAD actual contiene el mismo bug.

No se revalidaron las comparativas comerciales entre CRMs ni los eventos regulatorios particulares mencionados en ese informe. Esas afirmaciones no son requisitos de implementación. Para añadir una regla externa nueva: URL/documento, entidad emisora, versión, fecha efectiva, alcance, revisor y fecha de próxima revisión.

## Registro de decisiones

| Decisión propuesta | Motivo | Validación requerida |
|---|---|---|
| No unir cuentas automáticamente con pesos ilustrativos | Riesgo de mezclar tarjetas del mismo acreedor | Corpus etiquetado y revisión en T05 |
| Snapshot consolidado con política explícita | Burós/fechas pueden diferir | T06/T11, casos de conflicto |
| Sin score de preparación 0–100 arbitrario | No existe calibración en el informe | Conteos y motivos por regla |
| Presupuesto adicional a obligaciones mínimas | El optimizador no debe omitir obligaciones | T14, contrato de presupuesto |
| Programas de muestra internos e inactivos para producción | No se verificó underwriting de un prestamista específico | T20 y revisión de fuentes |
