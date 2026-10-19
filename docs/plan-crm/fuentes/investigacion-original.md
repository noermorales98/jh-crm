# Auditoría profunda del motor de crédito y fondeo de J&H CRM

## Hallazgos ejecutivos

Después de revisar el código actual del repositorio, la conclusión principal es que **J&H CRM ya tiene una base técnica bastante más sólida que un simple clon visual de Fondify**: existe un dominio real de clientes, expedientes, reportes, snapshots por buró, cuentas, rondas de disputa, cartas, comparaciones, pagos, documentos, roles y portal; además, el flujo de crédito está integrado en `Client → ServiceCase → CreditCase → CreditReport/CreditItem/CreditRound`. fileciteturn5file0L2-L2 fileciteturn18file0L2-L2

El problema principal **ya no es de frontend**. Está en la capa de inteligencia de negocio: varias reglas que aparentan ser un motor profesional de análisis crediticio son en realidad heurísticas internas, algunas heredadas conceptualmente del scraping de Fondify, y varias no están respaldadas por FICO, VantageScore, CFPB, prestamistas concretos ni un modelo estadístico propio. El documento de Fondify dentro del repositorio confirma que se reprodujeron módulos como Plan de Acción, Análisis, Score Plan, Fondeo y Avance tomando como referencia la superficie observada del producto, no su backend. fileciteturn19file0L2-L2

Mi recomendación central es **no intentar descubrir la “fórmula secreta de Fondify”**. La arquitectura correcta es construir un motor propio que separe claramente:

**datos extraídos del reporte → normalización → métricas objetivas → reglas configurables → recomendaciones → estimaciones solo cuando exista una fórmula legítima para el producto financiero concreto.**

Esto importa especialmente porque una persona no tiene un único score universal. CFPB explica que el score puede cambiar por buró, modelo, producto crediticio e incluso por fecha; FICO igualmente señala que distintos prestamistas utilizan distintas versiones de sus scores. citeturn6search14turn6search18turn6search4

### Lo que ya está bien encaminado

El importador actual es mejor que lo documentado en auditorías anteriores: el código actual indica que el texto enviado a OpenRouter se redacta previamente y que **ya no se adjunta el PDF completo al modelo**. Además, limita el output mediante esquemas, no extrae SSN ni fecha de nacimiento a través de la IA y conserva un paso de confirmación. fileciteturn23file0L2-L2

También existe CI actual con lint, typecheck, build y smokes específicos para Score Plan, funding estimate, funding prep, PDF parsing y otras piezas; por tanto, la afirmación antigua de que no existía CI ya está superada por el `main` actual. fileciteturn34file0L2-L2

El Score Plan tiene una fórmula matemáticamente consistente para calcular cuánto habría que pagar para alcanzar determinada utilización:

\[
Pago=\max(0,\;Saldo-Límite\times Meta)
\]

Eso está correctamente implementado. fileciteturn11file0L2-L2

Asimismo, las rondas ya evolucionaron respecto de la auditoría del 8 de octubre: el esquema actual contiene `scope` y `method` en los elementos de disputa y existe smoke test para verificar su presencia. fileciteturn30file0L1-L19 fileciteturn30file4L82-L101

### Los problemas críticos que encontré

| Riesgo | Severidad | Problema actual | Consecuencia |
|---|---:|---|---|
| Cuentas repetidas entre burós | **Crítico** | Una misma tarjeta reportada por Experian, Equifax y TransUnion puede contarse tres veces | límites, balances, número de tarjetas, AU y fondeo quedan inflados |
| Score sin modelo | **Crítico** | Se guarda `score`, pero no FICO/VantageScore + versión + variante | el sistema compara números que pueden no ser comparables |
| Fondeo en dólares | **Crítico** | El CRM inventa bandas de $1,500–$32,000 y factores propios | puede parecer una predicción real de aprobación/monto sin base de prestamista |
| AU | **Alto** | Se detecta con regex y se recomienda hasta cierto número/monto | clasificación y recomendación pueden ser incorrectas |
| Plan de Acción | **Alto** | contiene promesas del tipo `+40 a +100 FICO` | no existe fundamento para predecir esos aumentos |
| Negativos | **Alto** | `isNegative`/`negativeType` se trata casi como diagnóstico de disputa | negativo ≠ incorrecto ≠ disputable |
| Fondeo por buró | **Alto** | 720/10%/3 inquiries/2.5 años/$40K se presentan como matriz | no son requisitos universales de underwriting |
| Importador | **Alto** | máximo 200 ítems y se indica preferir negativos/colecciones | puede perder cuentas positivas necesarias para estructura, edad y utilización |
| Inquiries | **Medio-Alto** | se guarda principalmente un contador | falta fecha, tipo, propósito y agrupación de rate shopping |
| QA | **Medio** | tests validan que la heurística haga lo programado | no validan que la heurística represente la realidad crediticia |

El hallazgo más importante en código es el **doble/triple conteo**. En `action-plan.ts`, la clave de deduplicación contiene el propio `bureau`:

`creditorName | bureau | limit | balance`

y posteriormente `totalLimit`, `totalUsed`, `cardsGe2k`, `cardsGe5k` y `openCards` se calculan sumando esas filas. Por diseño, Chase/Experian y Chase/Equifax son entidades distintas aunque representen la misma tarjeta. fileciteturn8file0L2-L2

Eso puede convertir, por ejemplo, una sola tarjeta Chase con límite de $10,000 que reporta a los tres burós en algo conceptualmente parecido a:

\[
\$10,000 + \$10,000 + \$10,000 = \$30,000
\]

cuando el cliente realmente tiene **$10,000** de crédito disponible. La misma duplicación afecta las cuentas AU y la supuesta estructura de tres o más tarjetas. El motor de fondeo que depende de esos resultados hereda el error. fileciteturn8file0L2-L2

Hay otro problema en la clasificación revolving: el código utiliza una condición que admite cualquier ítem que no sea negativo como posible `revolvingItem`, y la colección de `cards` se construye simplemente cuando existe balance o límite. Eso puede mezclar préstamos instalment, auto, mortgage y revolving en una métrica destinada a tarjetas. fileciteturn8file0L2-L2

Por tanto, **antes de perfeccionar cualquier fórmula de fondeo o Score Plan, hay que arreglar la representación de las cuentas**.

## Base de datos crediticia que el CRM necesita

El importador actualmente captura una base útil: acreedor, número enmascarado, tipo, buró, saldo, límite, pago mensual, fechas de apertura/reporte, estados, `negativeType`, remarks y algunos contadores por buró. fileciteturn23file0L2-L2 fileciteturn25file0L2-L2

Pero eso no alcanza para construir correctamente todos los módulos que quieres.

FICO describe que un reporte contiene, entre otras cosas, tipo de cuenta, fecha de apertura, límite o monto del préstamo, saldo e historial de pagos; también usa información sobre delinquencies, antigüedad, utilización, nuevos créditos, consultas y mezcla de tipos de crédito. citeturn7search0

Además, los propios reportes pueden identificar la responsabilidad de la persona sobre la cuenta como individual, joint, cosigner o authorized user. Experian lo documenta explícitamente. citeturn10search3

### Separar la cuenta real de cómo aparece en cada buró

Éste debería ser el cambio estructural más importante.

En vez de:

```text
CreditItem
  Chase / Experian
  Chase / Equifax
  Chase / TransUnion
```

el dominio debería aproximarse a:

```text
CreditTradeline
  id
  clientId
  normalizedCreditor
  maskedAccountFingerprint
  accountFamily
  ownership
  openedAt
  closedAt

CreditTradelineObservation
  tradelineId
  reportId
  bureau
  balance
  creditLimit
  pastDue
  accountStatus
  paymentStatus
  dateReported
  remarks
  paymentHistory
  confidence
```

De esa manera:

```text
CHASE ****1234
├── Experian observation
├── Equifax observation
└── TransUnion observation
```

es **una cuenta**, con tres observaciones.

No recomiendo eliminar `CreditItem` ni rehacer tu arquitectura actual. De acuerdo con el diseño existente del repositorio, lo correcto sería añadir una capa canónica de identidad y relacionar cada `CreditItem` importado a un `canonicalTradelineId`. Tu propia documentación arquitectónica ya favorece migraciones aditivas en vez de reescribir CreditCase/CreditReport/CreditItem. fileciteturn18file0L2-L2

### Campos que deberían añadirse o normalizarse

| Entidad | Campos esenciales |
|---|---|
| Score | `value`, `bureau`, `modelFamily`, `modelVersion`, `industryVariant`, `scoreDate`, `reasonCodes[]` |
| Tradeline | tipo canónico, ownership, abierta/cerrada, fecha apertura/cierre |
| Revolving | límite, saldo reportado, high balance, past due, payment status |
| Installment | original amount, current balance, payment, term si existe |
| Historial | 30/60/90/120 late, timeline mensual cuando el reporte la exponga |
| Derogatorio | charge-off, collection, repo, foreclosure, bankruptcy, fecha relevante |
| Collection | collector, original creditor, amount, status |
| Disputa | consumer disputed, reason, evidence, fuente de la afirmación |
| Inquiry | nombre, buró, fecha, hard/soft, propósito si puede determinarse |
| Score explanation | score factors/reason codes exactamente como fueron reportados |
| Provenance | página/sección/text span del PDF de donde salió cada dato |
| Calidad | confidence por campo, no únicamente confidence de todo el PDF |

Los reason codes son particularmente importantes. VantageScore aconseja utilizar los reason codes que acompañan el score precisamente para explicar qué factores están afectándolo; FICO también explica que los score factors se entregan ordenados por importancia. citeturn6search19turn7search0

En otras palabras, cuando el reporte ya te dice:

> balance-to-limit demasiado alto

es mejor mostrar eso que inventar:

> “este problema cuesta aproximadamente 50 puntos”.

### Guardar qué score es

Ésta es una carencia importante del esquema actual.

Un `score = 710` no es información suficiente.

Deberías almacenar algo como:

```ts
type CreditScoreObservation = {
  bureau: "EXPERIAN" | "EQUIFAX" | "TRANSUNION";
  value: number;

  family:
    | "FICO"
    | "VANTAGE"
    | "OTHER"
    | "UNKNOWN";

  version?: string;       // "8", "9", "10", "10T", "3.0", "4.0", ...
  industry?: string;      // bankcard, auto, mortgage, generic
  pulledAt: Date;
  reasonCodes: string[];
};
```

CFPB es explícito: no existe “un solo score”; puede cambiar por modelo, fuente, producto y fecha. citeturn6search14turn6search26

Esto también cambia cómo debe funcionar tu comparación histórica. Comparar:

```text
VantageScore 3.0: 670
FICO 8: 695
```

como si fuera:

```text
+25 puntos
```

sería incorrecto.

La evolución únicamente debería calcularse cuando:

```text
bureau igual
AND modelFamily igual
AND modelVersion igual
AND industryVariant igual
```

o debería mostrar claramente que se trata de modelos diferentes.

### No usar el promedio de los tres scores como underwriting

Actualmente el Action Plan calcula el promedio aritmético de los scores disponibles. fileciteturn8file0L2-L2

Puedes conservarlo como un **KPI puramente visual**, pero debería llamarse:

> “Promedio informativo de scores mostrados”

y nunca alimentar directamente una afirmación como:

> “califica para fondeo”.

Incluso dentro de hipotecas existen reglas específicas distintas. CFPB explica que tradicionalmente muchos prestamistas hipotecarios miran las tres agencias y el score intermedio, mientras que Fannie Mae tiene reglas propias para representative score y average median según el tipo de expediente. citeturn6search30turn6search5

Además, el panorama hipotecario está cambiando: Fannie Mae ya incorporó nuevas reglas y modelos y, desde noviembre de 2025, Desktop Underwriter dejó de requerir un mínimo genérico de third-party score para su propia evaluación de riesgo. citeturn6search29

Eso demuestra por qué **“720 = listo para financiamiento” no debe existir como verdad global del CRM**.

## Auditoría funcional módulo por módulo

### Desglose por Buró

**Qué hace ahora:** presenta score, utilización, inquiries, negativos y una etiqueta bueno/necesita mejorar. Usa los umbrales fijos `720`, `10%` y `3 inquiries`. fileciteturn8file0L2-L2 fileciteturn20file0L2-L2

**Qué está bien:** mostrar Experian, Equifax y TransUnion por separado es correcto porque los datos pueden diferir entre agencias. FICO explica que las agencias pueden tener información distinta o recibir actualizaciones en momentos diferentes. citeturn7search0

**Qué debe cambiar:** no debe decir simplemente “Bueno” porque `score >= 720`. FICO deja claro que incluso la definición de buen score depende del estándar del prestamista; uno puede reservar sus mejores condiciones para más de 730 y otro para más de 760. citeturn7search0

La tarjeta de cada buró debería mostrar:

```text
EXPERIAN
FICO Score 8: 711

Factores principales
• Revolving utilization too high
• Recent delinquency
• Too many accounts with balances

Revolving
Overall: 37.2%
Mayor utilización individual: 82.1%

Derogatorios
1 charge-off
2 late-payment histories

Hard inquiries
2 recientes
```

Si no conoces el modelo:

```text
Score reportado: 711
Modelo: no identificado
No utilizar para evaluar elegibilidad de un producto.
```

### Estructura de Crédito Rotativo

Éste es hoy uno de los módulos matemáticamente más comprometidos porque la misma tarjeta puede contarse una vez por cada buró. fileciteturn8file0L2-L2

Debe operar exclusivamente sobre:

```text
canonicalTradelines
WHERE
  family = REVOLVING
  AND status = OPEN
```

y separar:

```text
PRIMARY
JOINT
AUTHORIZED_USER
```

La utilización por cuenta:

\[
U_i=\frac{Balance_i}{Limit_i}\times100
\]

La utilización agregada:

\[
U_{agg}=
\frac{\sum Balance_i}
{\sum Limit_i}
\times100
\]

Eso debe calcularse sobre **cuentas reales únicas**, no tres observaciones del mismo tradeline. FICO confirma que la utilización es la proporción del saldo revolving respecto del crédito disponible y que el modelo analiza la utilización dentro de su categoría de amounts owed. citeturn7search0

También conviene mostrar ambas cosas:

```text
Utilización agregada: 18%

Citi:        4%
Chase:      51%
Discover:    7%
```

porque un 18% agregado no significa que una tarjeta individual al 51% sea irrelevante. FICO considera múltiples elementos de la deuda revolving y no existe un único porcentaje mágico que equivalga a los puntos óptimos. citeturn7search0

### Estrategia de Usuario Autorizado

Aquí recomiendo un cambio fuerte.

La UI actual dice:

> “máx. 3 recomendado”

y:

> “agregar AU de al menos $15,000 en banco grande”

mientras que el catálogo de acciones también incluye recomendaciones de AU ≥ $15K. fileciteturn20file0L2-L2 fileciteturn29file0L2-L2

No encontré una base oficial para ninguna de esas dos cifras.

Un AU legítimo puede aparecer en el reporte y su límite/historial puede influir en el perfil; Experian, Equifax y TransUnion explican que una cuenta AU puede aparecer y ayudar o perjudicar dependiendo de cómo se administre y reporte. citeturn10search0turn10search1turn10search5

Pero el motor debería decir:

```text
Cuentas AU detectadas: 1

AMEX ****4321
Edad: 8.2 años
Límite: $18,000
Saldo: $450
Utilización: 2.5%
Historial adverso detectado: no

Posible efecto:
✓ antigüedad favorable
✓ utilización baja
✓ límite elevado

Riesgo:
si aumenta el saldo o aparece un pago tardío,
también puede perjudicar el perfil.
```

No:

```text
Necesita 2 AU adicionales.
```

Tampoco recomiendo convertir J&H CRM en un recomendador de compra de tradelines. La FTC ha actuado contra esquemas que vendían acceso artificial a cuentas de otras personas para aparentar una mejor situación crediticia. citeturn8search11turn8search17

Además, la detección mediante regex actual (`authorized user`, `AU`, etc.) debería sustituirse por un `ownershipType` normalizado. Los reportes pueden distinguir explícitamente individual, joint, cosigner y authorized user. citeturn10search3turn10search4

### Preparación para Financiamiento por Buró

Actualmente se consideran:

```text
Score >= 720
0 negativos
Utilización <= 10%
Edad >= 2.5 años
Inquiries <= 3
3+ tarjetas
>= 1 tarjeta de $2K
>= 1 tarjeta de $5K
$40K límites combinados
```

y un solo buró que pase todos los checks vuelve `qualified=true`. Además, cuando no existe información de antigüedad, `ageOk === null` **no impide aprobar la fila**. fileciteturn9file0L2-L2

Esta matriz debe dejar de llamarse una calificación general de fondeo.

Ninguna de esas cifras es un estándar universal de underwriting. FICO señala que cada prestamista define sus propios estándares y que no existe una única utilización ideal. citeturn7search0

El motor correcto debe funcionar mediante **Funding Programs**:

```ts
FundingProgram {
  id
  name
  productType

  scoreRequirements[]
  allowedScoreModels[]

  maxUtilization?
  maxRecentHardInquiries?
  derogatoryRules[]

  minIncome?
  maxDTI?

  minBusinessRevenue?
  minTimeInBusiness?
  minDSCR?

  documentationRequirements[]
}
```

Entonces:

```text
Perfil genérico para tarjeta personal
UNKNOWN

Programa A
PASS 7 / 9
UNKNOWN 2 / 9

Programa B
FAIL
Motivo: utiliza un score distinto al disponible.
```

Sobre todo:

> **UNKNOWN no puede equivaler a PASS.**

En tu código actual, la ausencia de `dateOpened` puede convertirse indirectamente en aprobación porque `null` es aceptado dentro de `allOk`. fileciteturn9file0L2-L2

Debe aplicarse una lógica tri-state:

```ts
type RuleResult = "PASS" | "FAIL" | "UNKNOWN";
```

y:

```text
allPass = todas PASS
review = alguna UNKNOWN
fail = alguna FAIL
```

### Análisis de cuentas negativas

Tu agrupación actual separa charge-off/collections/repo/foreclosure, late payments, datos personales, inquiries y otros. fileciteturn9file0L2-L2

Eso es una buena **clasificación visual**, pero no debería ser el motor de disputa.

La jerarquía correcta debería ser:

```text
NEGATIVE
└── ¿El dato es potencialmente incorrecto?
    ├── Sí → REVIEW_FOR_DISPUTE
    ├── No → ACCURATE_NEGATIVE
    └── No sabemos → CLIENT_REVIEW_REQUIRED
```

La ley no convierte un elemento negativo en disputable por ser negativo. FTC señala expresamente que información negativa correcta y actual no puede eliminarse legalmente simplemente porque perjudique al consumidor. citeturn8search2turn8search14turn8search19

El mejor motor de “Análisis” no debe preguntarse:

> “¿Qué negativos puedo borrar?”

sino:

> “¿Qué inconsistencias, errores, omisiones o datos no reconocidos necesitan revisión?”

Ejemplos de reglas automáticas legítimamente útiles:

```text
Misma cuenta
Experian: balance $4,320
Equifax:  balance $0
TU:       balance $4,320

→ diferencia encontrada
→ comprobar dateReported antes de asumir error
```

```text
Experian: ownership INDIVIDUAL
Equifax:  ownership AUTHORIZED_USER

→ discrepancia de responsabilidad
→ revisión humana
```

```text
Payment history:
EXP: 30-late en 06/2026
EQX: OK
TU:  OK

→ discrepancia relevante
→ pedir al cliente y documentos confirmar
```

El CRM debería guardar un **DisputeAssertion**:

```ts
{
  field: "paymentHistory.2026-06",
  claimedValue: "ON_TIME",
  reportedValue: "30_DAYS_LATE",
  reason: "CLIENT_STATES_PAID_ON_TIME",
  evidenceDocumentIds: [...],
  clientConfirmed: true
}
```

y una carta debería generarse sobre esas afirmaciones concretas.

CFPB recomienda que una disputa identifique qué información es incorrecta, por qué y adjunte documentación que respalde la disputa; las agencias no tienen por qué investigar afirmaciones frívolas o sin suficiente información. citeturn9search23turn5search24

### Score Plan

Conceptualmente, éste puede convertirse en **uno de los mejores módulos de J&H**.

La fórmula actual de paydown es correcta:

\[
P_i=
\max(0,B_i-L_iT)
\]

donde:

- \(B_i\) = saldo reportado;
- \(L_i\) = límite;
- \(T\) = utilización objetivo en decimal. fileciteturn11file0L2-L2

Ejemplo:

```text
Límite   $10,000
Saldo     $8,000
Actual       80%
Meta         10%

Saldo meta = 10,000 × 0.10 = 1,000
Pago estimado = 8,000 - 1,000 = $7,000
```

Eso coincide exactamente con el smoke test actual. fileciteturn35file0L2-L2

Lo que debe cambiar es la promesa implícita “sube el puntaje”.

El producto debería llamarse algo como:

> **Plan de Optimización de Utilización**

y permitir objetivos:

```text
Meta seleccionada
○ 50%
○ 30%
○ 20%
○ 10%
○ 5%
○ personalizada
```

pero dejando claro que son **escenarios matemáticos**, no niveles garantizados de FICO.

FICO establece específicamente que no existe un único utilization percentage que produzca puntos óptimos. citeturn7search0

Además, el módulo debe calcular:

```text
Utilización individual
Utilización agregada
Pago requerido individual
Pago requerido agregado
```

Para agregado:

\[
P_{agg}=
\max(
0,
\sum B_i -
T\sum L_i
)
\]

Por ejemplo:

| Tarjeta | Límite | Saldo | Util. |
|---|---:|---:|---:|
| A | $10,000 | $8,000 | 80% |
| B | $5,000 | $500 | 10% |
| C | $5,000 | $0 | 0% |
| **Total** | **$20,000** | **$8,500** | **42.5%** |

Para llevar el agregado a 10%:

\[
8500-(20000\times0.10)=\$6,500
\]

Sin embargo, pagar solamente $6,500 a cualquier tarjeta aleatoria no necesariamente produce el mismo perfil de utilización individual. Por eso el Score Plan debería incluir un algoritmo de asignación.

Un enfoque determinista:

```text
Primero:
  cuentas por encima del límite / morosas

Después:
  revolving con utilización individual más alta

Luego:
  bajar cada cuenta a un bucket configurable

Finalmente:
  alcanzar utilización agregada deseada
```

No recomiendo optimizar “puntos FICO” porque no tienes acceso al algoritmo de FICO.

También debes indicar que el saldo del reporte no necesariamente es el saldo en tiempo real. Los emisores suelen reportar información alrededor del cierre del ciclo, por lo que pagar antes de la fecha de reporte puede producir un resultado distinto a pagar únicamente antes del due date. citeturn5search3turn5search7

### Preparación para Fondeo

Éste es el módulo que **más recomiendo cambiar antes de ponerlo frente a clientes**.

Actualmente `funding-estimate.ts` asigna artificialmente:

```text
<580       $1,500
580–619    $3,500
620–659    $7,000
660–699   $12,000
700–719   $18,000
720–739   $24,000
740+      $32,000
```

y después aplica multiplicadores de utilización, número de negativos, burós “aprobados” y calificación; también utiliza 45% de la capacidad revolving disponible como ancla y genera bandas `low = 60%`, `high = 140%`. fileciteturn14file0L2-L2

No encontré sustento externo para esas cantidades o factores.

Aunque el código las denomina adecuadamente “estimado interno JH” y dice que no es oferta/preaprobación, para un usuario final **el simple hecho de mostrar `$8,000–$18,000` transmite la impresión de capacidad real de fondeo**. fileciteturn13file0L2-L2

Recomiendo eliminar el monto genérico.

¿Por qué? Porque el reporte de crédito no contiene todos los datos requeridos para saber cuánto crédito otorgará un acreedor. Para una tarjeta de crédito, Regulation Z obliga al emisor a considerar capacidad de pago basada en ingresos/activos y obligaciones actuales, no únicamente score y utilización. citeturn5search1

En préstamos comerciales, SBA señala que el análisis puede involucrar historial o score, **cash flow, equity y collateral**, además de capacidad razonable de pago; los propios programas y prestamistas tienen requisitos diferentes. citeturn5search2turn5search6turn5search10

El nuevo módulo debería ser:

```text
Preparación para Fondeo

Crédito personal               78/100
Documentación                 incompleta
Ingresos                       no capturados
Obligaciones mensuales        $1,860
DTI                            no disponible
Negativos                      0
Utilización revolving          8.4%
Hard inquiries recientes       1
Score                          FICO 8 EX 735

Estado:
Perfil crediticio favorable,
pero no se puede estimar capacidad de aprobación
sin ingresos y producto objetivo.
```

Luego puedes conectar productos concretos:

```text
Tarjeta
Línea personal
Auto
Mortgage
Business credit card
Business LOC
SBA
Equipment financing
```

y cada uno tendrá su RuleSet propio.

### Prioridades del Plan de Acción

Aquí hay contenido que debería retirarse inmediatamente.

Actualmente el catálogo dice, por ejemplo:

```text
Charge-offs: +40 a +100 FICO
Late payments: +50 a +100
High utilization: +30 a +80
High limit: +20 a +50
Combined limit: +20 a +50
```

junto con timelines estimados. fileciteturn29file0L2-L2

No existe una fórmula pública que permita afirmar esos incrementos para una persona concreta. FICO deja claro que el peso de cualquier factor depende del resto del archivo crediticio, y que incluso los porcentajes 35/30/15/10/10 son aproximaciones por categorías, no una calculadora directa de puntos. citeturn7search0

Sustituiría:

> `Impacto FICO: +40–100`

por:

> `Importancia crediticia: Alta`

y:

> `Razón: existe una derogatoria grave; su impacto depende de antigüedad, severidad, frecuencia, modelo de score y resto del archivo.`

FICO señala precisamente que en late payments importan recencia, severidad y frecuencia. citeturn7search0

También corregiría esta frase actual:

> “cualquier dato inexacto es motivo de eliminación”

por:

> “los datos inexactos, incompletos o no verificables pueden requerir corrección o eliminación según el resultado de la investigación”.

Una discrepancia en un campo no implica automáticamente que todo el tradeline deba desaparecer. CFPB describe el proceso como investigación y corrección de la información disputada, y FTC recuerda que los datos correctos no pueden eliminarse por ser negativos. citeturn9search23turn8search14

### Rondas y Avance

Esta área está conceptualmente más cerca de lo que utilizan otros CRMs.

Tu esquema ya distingue outcomes como:

```text
DELETED
UPDATED
VERIFIED
UNCHANGED
NEW
```

y permite override manual. fileciteturn31file2L41-L60 fileciteturn31file3L63-L94

Eso es bueno.

La evolución ideal sería:

```text
Round
  sentAt
  method
  recipient
  trackingNumber?

DisputeItem
  assertion
  evidence
  bureau
  scope
  method

Response
  receivedAt
  bureau/furnisher
  documentId
  disposition

Comparison
  previousObservation
  newObservation
  detectedChange
  reviewedResult
```

Una regla importantísima:

> cambio posterior a disputa ≠ cambio causado por la disputa.

El CRM debería decir:

```text
“Cuenta ya no aparece en el reporte del 18-Oct-2026”
```

y no:

```text
“J&H eliminó esta cuenta”.
```

CFPB explica que, normalmente, las agencias investigan disputas en aproximadamente 30 días y en algunos casos el proceso puede llegar a 45 días. citeturn5search4

Eso permite construir fechas correctamente:

```text
sentAt
receivedAt estimado
investigationDueAt
followUpAt
updatedReportRequestedAt
```

sin crear rondas rígidas del tipo “30 / 15 / 30” para todo caso.

## Matemáticas y motor de reglas

La mejor arquitectura para J&H no es un gran prompt preguntándole a la IA:

> “analiza el crédito y dime qué hacer”.

La IA debe ser **extractor y asistente de lenguaje**.

Las decisiones matemáticas deben ser código determinista.

### Motor de normalización

Pipeline recomendado:

```text
PDF
 ↓
text extraction / OCR
 ↓
PII redaction
 ↓
AI structured extraction
 ↓
Zod validation
 ↓
normalizer
 ↓
canonical tradeline matcher
 ↓
human review
 ↓
confirmed credit snapshot
 ↓
deterministic engines
```

El importador actual ya tiene una parte considerable de este diseño: extracción, redacción, ventanas, schema y revisión. fileciteturn23file0L2-L2

Lo que falta es introducir formalmente:

```text
RAW
PROPOSED
CONFIRMED
```

por campo o por observation.

Nunca debería ocurrir:

```text
AI dice CHARGE_OFF
→ automáticamente generar disputa
```

sino:

```text
AI propone CHARGE_OFF
→ reglas verifican campos
→ staff confirma
→ cliente confirma posible inexactitud
→ eligible para workflow de disputa
```

### Matching entre los tres burós

Sugiero una puntuación de similitud determinista para decidir si dos registros son la misma cuenta.

Ejemplo:

\[
M =
0.35A +
0.25C +
0.15D +
0.15T +
0.10L
\]

donde:

- `A`: coincide account suffix/fingerprint;
- `C`: acreedor normalizado;
- `D`: fecha apertura compatible;
- `T`: account type compatible;
- `L`: límite/original amount compatible.

No recomiendo tomar esos pesos como universales; son un ejemplo técnico que deberías calibrar con tus propios fixtures.

Una política razonable:

```text
M >= 0.90      merge automático
0.70–0.89      pedir confirmación
<0.70          mantener separado
```

Más importante que los pesos concretos es **no usar solamente creditorName**, porque una persona puede tener dos tarjetas del mismo banco.

### Métricas de antigüedad

Actualmente se usa simplemente la cuenta más antigua y un umbral de 2.5 años. fileciteturn9file0L2-L2

Deberías calcular varias métricas:

\[
OldestAge =
Today-\min(OpenDate)
\]

\[
NewestAge =
Today-\max(OpenDate)
\]

\[
AAoA =
\frac{\sum AgeMonths_i}{N}
\]

y reportarlas sin intentar convertirlas a puntos.

FICO confirma que puede considerar edad de la cuenta más antigua, más nueva y promedio de antigüedad. citeturn7search0

El módulo entonces puede decir:

```text
Cuenta más antigua        8a 7m
Promedio antigüedad       4a 2m
Cuenta más reciente       3m
```

Mucho más útil que:

```text
Edad ✓
```

### Inquiries

Un simple número `3` es insuficiente.

FICO distingue hard inquiries de soft inquiries y trata especialmente el rate shopping de mortgage, auto y student loans; múltiples consultas relacionadas pueden agruparse dentro de determinadas ventanas. citeturn7search0

Necesitas:

```ts
CreditInquiry {
  bureau
  creditorName
  inquiryDate
  kind: "HARD" | "SOFT" | "UNKNOWN"
  purpose:
    | "CREDIT_CARD"
    | "AUTO"
    | "MORTGAGE"
    | "STUDENT"
    | "PERSONAL"
    | "UNKNOWN"
}
```

y calcular:

```text
Hard inquiries recientes
Hard inquiries no agrupables
Rate-shopping groups
Última inquiry
```

No:

```text
3 = OK
4 = FAIL
```

### Score Plan con presupuesto

Además del pago requerido para llegar a una meta, podrías permitir:

```text
El cliente tiene $2,000 disponibles este mes.
¿Cuál es el mejor uso matemático?
```

Ejemplo:

```text
Capital disponible: $2,000

CHASE
$8,000 / $10,000 = 80%

CITI
$2,000 / $5,000 = 40%

AMEX
$300 / $5,000 = 6%
```

Algoritmo inicial:

```pseudo
accounts = open primary revolving accounts
exclude unknown limits

while budget > 0:
    select account with greatest utilization
    nextTarget = next configured utilization threshold
    payment = min(
        budget,
        balance - limit * nextTarget
    )
    apply payment
    budget -= payment
```

Esto **no predice un aumento de score**, pero sí optimiza matemáticamente la estructura revolving según un criterio definido.

Una mejora posterior puede evaluar simultáneamente:

```text
individual utilization
aggregate utilization
interest/APR
minimum payments
cash budget
```

y ofrecer modos diferentes:

```text
Optimizar utilización
Reducir intereses
Reducir pago mensual
Híbrido
```

Es importante no confundir consejo de score con salud financiera: bajar utilización puede ayudar al perfil, pero no debe recomendarse omitir pagos mínimos en otras deudas. CFPB recomienda priorizar capacidad real de pago y contactar al emisor ante problemas para cumplir obligaciones. citeturn5search21

### Fondeo basado en productos, no en score aislado

El reemplazo de `funding-estimate.ts` debería ser un rules engine.

Ejemplo conceptual:

```ts
type FundingRule = {
  id: string;
  field: string;
  operator: "gte" | "lte" | "eq" | "exists";
  value?: unknown;
  required: boolean;
  source: string;
};

type FundingRuleSet = {
  productId: string;
  version: number;
  effectiveFrom: Date;
  rules: FundingRule[];
};
```

Resultado:

```ts
{
  status: "PASS" | "FAIL" | "REVIEW",
  passed: [],
  failed: [],
  unknown: [],
  evaluatedAt,
  rulesetVersion
}
```

Cada requisito debe indicar de dónde salió:

```text
Fuente:
“Lender X underwriting sheet — versión 2026-09”

o

“Heurística interna J&H”
```

Nunca deben mezclarse.

Por ejemplo:

```text
720 score
```

podría ser válido como **objetivo interno J&H**, pero debe aparecer:

> Meta interna J&H, no requisito universal del prestamista.

### Capacidad financiera

Cuando quieras ir más allá de “credit readiness”, debes incorporar datos que no salen del reporte.

Para consumidor:

\[
DTI=
\frac{MonthlyDebtPayments}
{GrossMonthlyIncome}
\times100
\]

Para empresas puede necesitarse, según producto:

\[
DSCR=
\frac{NetOperatingIncome}
{AnnualDebtService}
\]

pero tampoco debes convertir DSCR en una regla global; cada prestamista/producto define sus requisitos.

SBA confirma que distintos prestamistas pueden considerar score/historial, cash flow, equity, collateral y otros elementos, y que el usuario debe preguntar específicamente por mínimos de score y requerimientos de cash flow. citeturn5search2turn5search10

Por tanto, la calculadora de fondeo futura debería pedir:

```text
Objetivo:
Business LOC

Ingresos mensuales
Obligaciones mensuales
Revenue negocio
Tiempo operando
Cash flow
Tipo de entidad
Industria
Personal guarantee
Collateral
Producto/lender objetivo
```

antes de emitir algo parecido a:

```text
rango de monto posible.
```

Y aun entonces, ese rango debe provenir de un programa concreto, no de una fórmula inventada por J&H.

## Cómo trabajan otros CRMs y qué conviene copiar

Lo que observé en plataformas de crédito apunta a un patrón bastante consistente: **el verdadero valor no está en adivinar el score futuro, sino en importar, auditar, documentar, disputar, volver a importar y comparar**.

### Credit Repair Cloud

Credit Repair Cloud promociona como flujo principal importar datos del reporte, identificar problemas, generar cartas y gestionar el proceso de disputa. También mantiene un procedimiento manual cuando el proveedor/reporte no puede importarse. citeturn9search0turn9search4

La lección para J&H es importante:

> **El importador automático nunca debe ser el único camino.**

Tu UI debería permitir corregir manualmente cada tradeline y cada dato extraído.

### DisputeFox

DisputeFox enfatiza la reimportación del siguiente reporte y la comparación lado a lado; además genera progress reports a partir del segundo import. citeturn9search1turn9search9turn9search17

Eso coincide muy bien con la arquitectura que ya tienes.

J&H puede superar esa experiencia mostrando:

```text
ANTES                    DESPUÉS
EXP 615                  EXP 648
EQX 602                  EQX 631
TU 622                   TU 644

CHASE
Balance $8,400           Balance $2,900
Status current           Status current

ABC COLLECTION
$842                     ya no aparece
```

pero etiquetando cuidadosamente:

> “ya no aparece”

en vez de:

> “eliminamos”.

### Client Dispute Manager

Un aspecto particularmente interesante del flujo público de Client Dispute Manager es el **credit report interview**: antes de disputar, el sistema necesita que el consumidor identifique qué considera incorrecto; la plataforma no debería inventarlo por él. citeturn9search7

Ese patrón es muy recomendable para J&H:

```text
Cuenta: CAPITAL ONE ****4421

¿Reconoces esta cuenta?
○ Sí
○ No
○ No estoy seguro

¿Es correcto el saldo?
○ Sí
○ No
○ No sé

¿Es correcta la morosidad 06/2025?
○ Sí
○ No
○ No sé

Explica:
[...]

Subir evidencia:
[...]
```

Eso convierte tu CRM en un sistema mucho más defensible que uno que marca automáticamente “dispute eligible”.

### ScoreCEO

ScoreCEO centra buena parte de su propuesta en flujo operativo, CRM, portal y controles de compliance, no únicamente en análisis matemático. citeturn9search2

Ésa también debería ser una fortaleza de J&H, especialmente porque tu plataforma ya tiene contratos, pagos, portal, auditoría y roles. fileciteturn5file0L2-L2

### El patrón común que deberías adoptar

| Capacidad | CRC | DisputeFox | ScoreCEO | CDM | J&H objetivo |
|---|---|---|---|---|---|
| Importación reporte | Sí | Sí | Sí | Sí | **Sí + IA** |
| Corrección manual | Sí | Sí | Sí | Sí | **Obligatoria** |
| Auditoría del reporte | Sí | Sí | Sí | Sí | **Evidence-based** |
| Entrevista cliente | Variable | Variable | Variable | Fuerte | **Sí** |
| Cartas | Sí | Sí | Sí | Sí | Ya existe |
| Rondas | Sí | Sí | Sí | Sí | Ya existe |
| Reimportación | Sí | Sí | Sí | Sí | Ya existe parcialmente |
| Comparación | Sí | Fuerte | Sí | Sí | Ya existe |
| Portal | Sí | Sí | Sí | Sí | Ya existe |
| Compliance | Importante | Importante | Fuerte | Sí | **Debe reforzarse** |
| Funding predictor genérico | No debería ser núcleo | — | — | — | **No usar fórmula inventada** |

La ventaja competitiva de J&H podría ser:

> **“Credit Intelligence + Case Management + Funding Readiness explicable”**

en vez de:

> “CRM que copia Fondify”.

Eso es mucho más defendible técnicamente.

## Arquitectura, seguridad, cumplimiento y hoja de ruta

### Arquitectura objetivo

Propongo cinco motores separados:

```text
Credit Import Engine
        ↓
Credit Normalization Engine
        ↓
Credit Analysis Engine
        ↓
Action Recommendation Engine
        ↓
Product Funding Rules Engine
```

Y aparte:

```text
Dispute Workflow Engine
Progress / Comparison Engine
```

La IA interviene únicamente en puntos controlados:

```text
Extraer PDF                 IA sí
Normalizar creditor names   IA opcional
Clasificar texto            IA opcional
Determinar matemática       NO
Decidir elegibilidad        NO, salvo explicar resultado
Inventar score futuro       NO
Inventar monto de fondeo    NO
Redactar explicación        IA sí
Redactar carta              IA sí, con hechos confirmados
```

### Cambios concretos en Prisma

Sin reescribir tus modelos actuales, añadiría aproximadamente:

```prisma
model CanonicalTradeline {
  id                String   @id @default(cuid())
  organizationId    String
  clientId          String

  creditorNormalized String
  accountFingerprint String?
  accountFamily      String?
  ownershipType      String?
  openedAt           DateTime?
  closedAt           DateTime?

  items              CreditItem[]
}
```

y en `CreditItem`:

```prisma
canonicalTradelineId String?
ownershipType        String?
openClosedStatus     String?
originalAmount       Decimal?
highBalance          Decimal?
pastDueAmount        Decimal?
dateClosed           DateTime?
dateLastPayment      DateTime?
dateFirstDelinquency DateTime?
consumerDisputed     Boolean?
extractionConfidence Decimal?
sourceLocatorJson    Json?
```

Más:

```prisma
model CreditScoreObservation {
  id
  reportId
  bureau
  value
  modelFamily
  modelVersion
  industryVariant
  reasonCodesJson
}
```

```prisma
model CreditInquiry {
  id
  reportId
  bureau
  creditorName
  inquiryDate
  inquiryType
  purpose
}
```

```prisma
model CreditDisputeAssertion {
  id
  creditItemId
  field
  reportedValue
  consumerClaim
  reason
  evidenceJson
  clientConfirmedAt
  reviewedBy
}
```

### Corregir el parser

El prompt actual permite hasta 200 items y literalmente indica “prefiere negativos/colecciones”. fileciteturn23file0L2-L2

Eso es contraproducente para los módulos de estructura crediticia.

Imagina un reporte grande:

```text
15 negativos
50 cuentas positivas
20 cuentas cerradas
...
```

y la IA decide priorizar solamente la parte negativa. Después intentas calcular:

```text
edad
credit mix
revolving limits
AU
utilization
total open accounts
```

sobre una muestra parcial.

La regla debería cambiar a:

```text
NO priorices cuentas negativas.
Extrae todas las cuentas que aparezcan.
Si la capacidad de una ventana se agota,
continúa mediante paginación/chunks.
```

y hacer merge por identificadores posteriormente.

Para reportes enormes:

```text
window 1 → tradelines 1–30
window 2 → tradelines 31–60
window 3 → tradelines 61–90
...
deduplicate
validate
```

No:

```text
máximo 200 y quedarse con “las interesantes”.
```

### Validación humana

Cada importación debería producir un dashboard:

```text
Extracción terminada

Scores
✓ 3 / 3 confirmados

Tradelines
✓ 18 alta confianza
⚠ 3 requieren revisión

Ownership
⚠ 2 AU inferidas, confirmar

Inquiries
⚠ fechas incompletas

Payment history
⚠ 4 cuentas sin detalle mensual

[Revisar antes de calcular plan]
```

Y no habilitar:

```text
Plan de Acción final
Fondeo
Ronda de disputa
```

hasta confirmar los campos críticos.

### Los tests actuales no prueban exactitud crediticia

El CI sí ejecuta Score Plan y funding smokes. fileciteturn34file0L2-L2

Pero el test de Score Plan comprueba cosas como:

```text
10,000 límite
8,000 saldo
target 10%
→ pagar 7,000
```

que confirma correctamente la aritmética, no que 10% sea una regla universal ni que eso produzca cierta subida del score. fileciteturn35file0L2-L2

Necesitas dos tipos distintos de tests:

```text
UNIT TEST
¿La fórmula hace lo que programamos?

DOMAIN VALIDATION
¿La regla programada es una afirmación legítima?
```

Los segundos deberían estar respaldados por fuentes/versiones:

```ts
rule: {
  id: "fico-no-single-optimal-util",
  category: "education",
  source: "FICO FAQ",
  lastReviewedAt: "2026-10-19"
}
```

### Fixtures crediticios que necesitas

Construiría una suite sintética que incluya, como mínimo:

| Fixture | Resultado esperado |
|---|---|
| misma Visa en 3 burós | una canonical tradeline |
| 1 mortgage + 1 Visa | solamente Visa entra en revolving |
| Visa primary + AU | ownership correcto |
| AU reportada en 3 burós | `auCards = 1`, no 3 |
| límite faltante | utilización `UNKNOWN` |
| saldo $0 | utilización 0%, no missing |
| charge card sin preset limit | no usar falsa utilización |
| scores modelos distintos | no calcular variación directa |
| score sin modelo | financiación = REVIEW |
| dateOpened faltante | age = UNKNOWN, nunca PASS |
| inquiry soft | no contar como hard |
| 3 mortgage inquiries agrupables | no tratarlas ciegamente como tres aplicaciones independientes |
| balance discrepante entre burós | generar anomaly, no disputa automática |
| negativo confirmado correcto | no generar argumento de eliminación |
| cuenta desaparece update | `NOT_PRESENT`, no “J&H deleted” |
| mismo creditor con 2 tarjetas | dos canonical accounts |
| 250 cuentas | ninguna se pierde por límite 200 |

### Compliance debe convertirse en feature del producto

J&H no solamente maneja datos: el README deja claro que el negocio principal incluye reparación de crédito y contratos/pagos. fileciteturn5file0L2-L2

A nivel federal, CROA prohíbe representaciones falsas o engañosas, exige contrato escrito y restringe pagos anticipados. citeturn8search0

FTC también explica que una credit repair organization no puede remover legítimamente información negativa correcta y actual. citeturn8search2turn8search5

El riesgo no es teórico. En agosto de 2026 la FTC volvió a anunciar una acción importante contra un esquema de credit repair por afirmaciones engañosas y cobros ilegales, entre otras prácticas. citeturn8search17

Además, el CFPB ha litigado específicamente cuestiones relacionadas con software de credit repair y cobro de honorarios, incluido Credit Repair Cloud. citeturn8search7turn8search27

Por eso convertiría compliance en estado computable:

```text
Client Compliance

✓ disclosure entregado
✓ contrato firmado
✓ fecha firma
✓ ventana cancelación registrada
✓ consumer authorization
✓ credit report source
✓ servicio autorizado
⚠ payment eligibility pending
```

La facturación de servicios de credit repair debe revisarse cuidadosamente contra CROA, TSR cuando aplique y la legislación estatal correspondiente antes de automatizar cobros. CFPB advierte particularmente sobre pagos upfront y sobre reglas adicionales para servicios vendidos mediante telemarketing. citeturn8search18

### Cambios que haría inmediatamente

**Prioridad crítica: exactitud del producto.**

Primero quitaría del frontend cualquier afirmación que pueda confundirse con ciencia crediticia y no lo sea:

```text
+40 a +100 FICO
+50 a +100 FICO
AU máximo 3
AU ≥ $15K
$40K = buen perfil
720 universal
≤3 inquiries universal
2.5 años universal
Estimated funding $X–$Y
```

Todos esos textos aparecen directa o indirectamente en el motor y Action Plan actuales. fileciteturn29file0L2-L2 fileciteturn20file0L2-L2 fileciteturn14file0L2-L2

Después corregiría la deduplicación de cuentas. Hasta que eso se resuelva, **los KPIs de límite total, open cards, tarjetas de $2K/$5K, AU y combined limit no deben alimentar decisiones**. fileciteturn8file0L2-L2

A continuación introduciría score model/version, ownership, inquiry records, payment history y provenance.

### Secuencia de desarrollo recomendada

| Fase | Trabajo | Resultado |
|---|---|---|
| **Corrección del dominio** | canonical tradelines + cross-bureau observations | números reales de cuentas/límites |
| **Enriquecimiento del parser** | ownership, score model, inquiries, payment history, status | datos suficientes |
| **Credit Analysis v2** | discrepancias + client interview + evidence | negativos accionables |
| **Score Plan v2** | individual + aggregate + presupuesto + statement timing | herramienta matemática real |
| **Action Plan v2** | prioridades derivadas de datos, sin score-point promises | recomendaciones defendibles |
| **Funding Readiness v2** | tri-state + RuleSets | preparación real por producto |
| **Funding Programs** | requisitos de lender/producto | pre-screen configurable |
| **Rounds v2** | assertion/evidence/deadlines/responses | dispute workflow auditable |
| **Progress v2** | canonical before/after | avances precisos |
| **Compliance engine** | contratos/disclosures/payment gates | menor riesgo operativo |

### Cómo debería verse el producto final

El sistema debería poder transformar un reporte en algo parecido a:

```text
ANÁLISIS J&H

Scores
Experian
FICO 8 · 712
Factores:
• revolving balances too high
• recent delinquency

Equifax
FICO 8 · 705

TransUnion
FICO 8 · 719


ESTRUCTURA

Cuentas reales revolving: 4
Primarias: 3
AU: 1

Límite primario:      $22,000
Saldo primario:        $8,450
Utilización:            38.4%

Con AU:
Límite mostrado:      $37,000
Saldo mostrado:        $8,750
Utilización:            23.6%


ALERTAS

Alta prioridad
CHASE
81% utilización

Alta prioridad
CAPITAL ONE
late 30 reportado en junio 2026

Requiere revisión
CAPITAL ONE junio 2026:
EXP: 30 days late
EQX: current
TU: current


SCORE PLAN

Presupuesto disponible: $3,000

Escenario matemático:
CHASE
$8,100 → $5,100
81% → 51%

Nueva utilización agregada primaria:
38.4% → 24.8%

No se estima un cambio concreto de FICO.
El resultado dependerá del modelo y del resto del archivo.


DISPUTE REVIEW

CAPITAL ONE
¿Fue correcto el late de junio 2026?
[ Sí ] [ No ] [ No sé ]

Si No:
[Agregar explicación]
[Subir estado de cuenta]
[Subir comprobante]

No se generará disputa hasta confirmar.


FUNDING READINESS

Perfil de crédito:
FAVORABLE CON OBSERVACIONES

Capacidad de pago:
DATOS INSUFICIENTES

Producto:
NO SELECCIONADO

Seleccione un producto/lender
para comparar reglas reales.
```

Éste es el punto fundamental: **J&H debe saber distinguir lo que conoce, lo que calcula, lo que infiere y lo que desconoce**.

Tu CRM ya tiene suficiente infraestructura para lograrlo. No necesita rehacerse. Tiene importación de PDF, datos por buró, reportes históricos, rondas, comparaciones, cartas, portal, roles y CI. fileciteturn5file0L2-L2 fileciteturn34file0L2-L2

Lo que necesita ahora es reemplazar la lógica inspirada en una interfaz de Fondify por **un dominio crediticio canónico y explicable**. Fondify puede seguir siendo referencia de UX —Action Center, plan visual, historial, reportes y secuencia comercial—, pero no debe ser la fuente implícita de reglas de underwriting. El propio documento de scraping de tu repositorio reconoce que el estimado de fondeo de J&H es una fórmula propia y no una reproducción del backend de Fondify. fileciteturn19file0L2-L2

La transformación más importante sería pasar de:

```text
PDF
→ IA
→ 720 / 10% / $40K / AU $15K
→ “califica”
→ monto estimado
```

a:

```text
PDF
→ extracción estructurada
→ revisión
→ identidad canónica de cuentas
→ métricas crediticias objetivas
→ anomalías y evidencias
→ Score Plan matemático
→ Action Plan explicable
→ reglas específicas del producto/lender
→ PASS / FAIL / UNKNOWN
→ workflow y seguimiento
```

Eso convertiría el proyecto de un CRM que **parece** entender crédito estadounidense en un CRM que puede explicar exactamente **qué dato vio, de dónde salió, qué fórmula aplicó, qué regla utilizó y qué parte todavía necesita revisión humana**. Esa trazabilidad es la diferencia entre replicar una interfaz y construir un verdadero motor de análisis crediticio.