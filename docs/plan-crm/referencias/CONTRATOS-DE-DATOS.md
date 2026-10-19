# Diccionario de datos y contratos

[Volver al índice](../README.md) · [Ejemplo Prisma](../ejemplos/03-PRISMA-ADITIVO.md)

## Tipos y ausencia

| Campo | Forma objetivo | Regla |
|---|---|---|
| Dinero | Decimal exacto en BD, centavos enteros en cálculo | Moneda obligatoria; no mezclar USD/MXN |
| Porcentajes objetivo | Basis points, 10000 = 100% | 1000 = 10%; validar 0..10000 |
| Ratio DTI | Fracción o bps, con unidad explícita | No guardar 30 sin decir porcentaje |
| Fecha del reporte | Fecha civil/fecha efectiva, no fecha de carga | Guardar precisión y fuente |
| Fecha parcial | Valor + `YEAR/MONTH/DAY` | No inventar día 1 |
| `null` | No extraído/no conocido | Nunca convertir con `|| 0` |
| `0` | Dato conocido en cero | Conservar como valor legítimo |
| Identidad de cuenta | ID canónico interno + vínculos | Sufijo enmascarado no es clave única |
| Confidence | Score técnico de extracción | No probabilidad calibrada ni aprobación |

## Entidades propuestas

**CanonicalTradeline:** organización, cliente, expediente/política de alcance, acreedor normalizado, familia, vínculo a observaciones y auditoría de identidad. Ownership puede diferir en el tiempo o por buró: guardar en observación y resolver explícitamente; no borrar conflictos en la entidad canónica.

**CreditItem/observación existente:** conservar texto normalizado y, según la retención aplicable, el origen protegido; agregar vínculo canónico opcional, buró, reporte, saldo/límite, estado abierto/cerrado/desconocido, responsabilidad, monto original, high balance, past due, fechas relevantes, historial mensual, referencias de fuente y calidad por campo.

**ScoreObservation:** valor, buró, familia, versión, variante/producto, fecha, proveedor/fuente y reason codes exactos. `UNKNOWN` no es un modelo comparable. Rangos de score deben depender del modelo identificado; no imponer 300..850 a todos los modelos posibles.

**Inquiry:** organización/cliente, reporte, buró, acreedor, fecha/precisión, HARD/SOFT/UNKNOWN, propósito y procedencia. Un contador legado se conserva como agregado de origen; no inventar tres filas sin fechas para representar un contador 3.

**ImportJob:** hash del documento, pipelineVersion, estado, páginas/ventanas esperadas/procesadas, errores, truncación, cobertura, límites operativos, costo técnico y reintentos. No se considera completo únicamente por recibir JSON válido.

**Snapshot:** IDs y revisiones de observaciones confirmadas, fecha efectiva, fecha de creación, autor, política, versión de cálculo y completitud. Datos derivados se pueden recalcular; mantener referencia al snapshot que los produjo.

**DisputeAssertion:** campo exacto y buró, valor reportado, afirmación del consumidor, motivo, documentos, confirmación, revisor y estados. No confundir afirmar un error con comprobarlo.

**Round/Response:** destinatario, método, estado, fecha de envío, recepción real o estimada separadas, política de plazo y documento de respuesta. No sustituir respuesta formal con desaparición en un PDF.

**FundingRuleSet:** producto/prestamista, versión, vigencia, ámbito, fuente, tipo INTERNAL/VERIFIED_LENDER, revisión y reglas requeridas/opcionales. Cada resultado señala qué observación respaldó la evaluación.

## Enums normalizados propuestos

```ts
type AccountFamily = "REVOLVING" | "INSTALLMENT" | "MORTGAGE" |
  "CHARGE" | "COLLECTION" | "OTHER" | "UNKNOWN";
type Ownership = "INDIVIDUAL" | "JOINT" | "COSIGNER" |
  "AUTHORIZED_USER" | "UNKNOWN";
type ReviewState = "PROPOSED" | "CONFIRMED" | "REJECTED";
type FieldQuality = "KNOWN" | "MISSING" | "INFERRED" | "CONFLICT" | "INVALID";
type RuleResult = "PASS" | "FAIL" | "UNKNOWN";
```

Un `UNKNOWN` de ownership impide incluir la cuenta en un total primario certificado. Una joint no se convierte silenciosamente en deuda exclusivamente individual; el programa define tratamiento.

## Qué conserva el locator

`documentId`, página física, sección, offsets del texto redactado o identificador de bloque OCR, raw token seguro y versión del extractor. Redacción altera offsets: conservar el mapa interno o señalar que corresponden a texto redactado. La UI no expone texto con PII a roles sin permiso.

## Validaciones de frontera

Validar objeto completo con la librería existente (Zod si ya se usa). Rechazar importes no finitos y fechas imposibles; separar signos, moneda y locale. `1,234.56` y `1.234,56` no se interpretan igual sin proveedor/locale. Límite cero o sin preset no produce una división válida. Saldo negativo se conserva como crédito a favor y requiere política explícita para métricas; no recortar el raw.
