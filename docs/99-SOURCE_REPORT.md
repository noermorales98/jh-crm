# CRM para JH Financial: levantamiento de requerimientos, flujo operativo y plan de desarrollo

## Diagnóstico ejecutivo

Después de contrastar las dos reuniones, los servicios actuales que compartiste y los patrones visibles en NCA Financial Services y Entrepreneur Funding Experts, la conclusión principal es que **el problema no está en que te falten pantallas del CRM, sino en que el dominio del negocio todavía no estaba modelado correctamente**.

Lo que tu cliente necesita **no es solamente un CRM tradicional de contactos**. Necesita una mezcla de:

**CRM de ventas + gestión de expedientes + seguimiento de servicios financieros + tareas + documentos + pagos + seguimiento de crédito.**

La estructura mental correcta es esta:

```text
LEAD
  ↓
CONTACTO / SEGUIMIENTO
  ↓
CONVERSIÓN
  ↓
CLIENTE
  ↓
EXPEDIENTE DE SERVICIO
  ├── Reparación de crédito
  ├── Comprador de casa
  ├── Crédito / funding empresarial
  ├── Préstamo personal
  ├── Página web
  └── CRM
        ↓
TAREAS + DOCUMENTOS + NOTAS + PAGOS + RECORDATORIOS
        ↓
FINALIZACIÓN DEL SERVICIO
        ↓
TESTIMONIO
```

La decisión arquitectónica más importante es:

> **No pongas el servicio y el estado del trabajo directamente en `Client`. Crea una entidad intermedia como `ServiceCase`, `Case`, `Engagement` o `ClientService`.**

¿Por qué? Porque una misma persona puede empezar con reparación de crédito y posteriormente contratar asesoría para comprar casa, pedir funding empresarial o contratar una página web. Además, cada servicio tiene fechas, tareas, documentos, pagos y etapas diferentes.

Esto también encaja con el modelo comercial de la competencia. NCA estructura su oferta alrededor de servicios, paquetes, consulta y productos relacionados con crédito, mientras que eFunding Experts conduce al prospecto mediante un flujo explícito de **aplicación → preaprobación → funding**, y su propia oferta para afiliados promociona un CRM para rastrear leads, deals y comisiones. citeturn1search5turn1search2turn1search12turn1search0

Mi recomendación es **no rehacer tu proyecto Next.js/MySQL desde cero**. Mantendría autenticación, layout, componentes, tablas CRUD y cualquier módulo de clientes/leads que ya funcione, pero reorganizaría el dominio alrededor de `Lead → Client → ServiceCase`. La auditoría exacta archivo por archivo del repositorio no quedó completada en esta investigación, por lo que no sería responsable afirmar qué componentes concretos de `jh-crm` deben eliminarse o conservarse; las modificaciones de modelo y flujo que siguen son, no obstante, las que deberían gobernar esa refactorización.

### Alcance recomendado ahora

| Área | Decisión |
|---|---|
| Leads | **MVP** |
| Clientes | **MVP** |
| Servicios/expedientes | **MVP crítico** |
| Reparación de crédito | **MVP crítico** |
| Rondas de disputas | **MVP crítico** |
| Reportes/snapshots de crédito | **MVP** |
| Documentos | **MVP** |
| Notas e historial | **MVP** |
| Tareas y recordatorios | **MVP** |
| Cotizaciones | **MVP** |
| Registro de pagos | **MVP** |
| Asesoría comprador de casa | **MVP** |
| Crédito/funding empresarial | **MVP básico** |
| Préstamos personales | **MVP básico** |
| Proyectos de páginas web | **MVP básico** |
| Proyectos CRM | **MVP básico** |
| Testimonios | **MVP** |
| LLC / creación de compañías | **Fuera del alcance actual** |
| Integración automática con burós | Fase posterior |
| SMS / WhatsApp automático | Fase posterior |
| Procesamiento de tarjetas | Fase posterior |
| Comisiones/afiliados | Fase posterior |
| Contabilidad completa | Fuera del MVP |

La exclusión de LLC es importante: aunque apareció anteriormente alrededor de crédito empresarial, tu instrucción más reciente fue explícita en que **por ahora no lo van a hacer**. No desarrollaría ni mostraría ese módulo.

## Qué realmente pidió el cliente en las reuniones

La segunda reunión aclara bastante mejor la primera. El cliente piensa el negocio desde su operación diaria, no desde conceptos técnicos como entidades, pipelines o relaciones de base de datos. Por eso probablemente sentiste que “no le entendías”: él te estaba describiendo acciones y excepciones mientras tú necesitabas descubrir un modelo de información.

Yo traduciría sus comentarios en estas necesidades de negocio.

| Lo que expresa el cliente | Requerimiento de software |
|---|---|
| “Quiero ver las personas interesadas” | Gestión de leads |
| “Saber de dónde vienen” | Fuente del lead |
| “Contactarlos” | Actividades, tareas y seguimiento |
| “Saber qué servicio quieren” | Interés por servicio |
| “Si ya empezó conmigo es cliente” | Conversión Lead → Client |
| “Saber quién está activo” | Estado del expediente |
| “Qué fue lo último que hice” | Timeline / Activity Log |
| “Qué tengo que hacer ahora” | Próxima acción |
| “Cuándo toca volver a revisar” | `nextActionAt` / recordatorio |
| “Primera ronda, segunda ronda...” | Rondas de disputa |
| “Esperamos unos 30–40 días” | Fecha configurable de seguimiento |
| “Ver qué cambió” | Comparación entre reportes/rondas |
| “Documentos de la persona” | Gestor documental |
| “Quién pagó” | Pagos |
| “Cuánto pagó / qué falta” | Balance del expediente |
| “Cotización” | Quote/Estimate |
| “También tiene otros servicios” | Varios expedientes por cliente |
| “Testimonios” | Captura + aprobación + publicación |

### El verdadero objeto central es el expediente

Actualmente podrías estar pensando algo similar a:

```text
Client
- name
- phone
- service
- status
- notes
```

Eso va a convertirse rápidamente en un problema.

El diseño debería ser:

```text
Client
│
├── ServiceCase: Reparación de Crédito
│      ├── CreditReports
│      ├── NegativeItems
│      ├── DisputeRounds
│      ├── Tasks
│      ├── Documents
│      ├── Notes
│      ├── Quote
│      └── Payments
│
├── ServiceCase: Comprador de Casa
│      ├── Goals
│      ├── Tasks
│      ├── Notes
│      └── Documents
│
└── ServiceCase: Página Web
       ├── Project stages
       ├── Tasks
       ├── Quote
       └── Payments
```

Así el cliente no tiene un único `status`. **Cada servicio contratado tiene su propio estado.**

Ejemplo:

> María puede ser un `CLIENT` activo.  
> Su reparación de crédito puede estar `WAITING_RESPONSE`.  
> Su asesoría para casa puede estar `ON_HOLD`.  
> Y su página web puede estar `IN_PROGRESS`.

Eso es imposible de representar correctamente con un simple `client.status`.

### Un aspecto que sí cambiaría respecto a lo dicho literalmente por el cliente

No programaría “cada 30 días” ni “cada 40 días” como una regla rígida.

El CFPB explica actualmente que las disputas deben identificar concretamente la información incorrecta, proporcionar explicación y documentación de soporte, y que los proveedores de información generalmente deben investigar y responder dentro de unos 30 días. Por eso las fechas de seguimiento tienen sentido operacionalmente, pero deben almacenarse como fechas configurables, no como una automatización rígida de “crear otra disputa cada 30 días”. citeturn1search1turn1search4

Tu sistema debería decir:

```text
Ronda enviada:
12 septiembre

Fecha sugerida de revisión:
12 octubre

Estado:
Esperando respuesta

Próxima acción:
Revisar nuevos resultados del reporte
```

Y permitir modificar la fecha manualmente.

Esto transforma una conversación ambigua del cliente en una regla de negocio sólida.

## Requerimientos funcionales del CRM

Propongo formalizar el proyecto bajo estos módulos. Éste sería el documento de alcance que yo presentaría si estuviéramos levantando el proyecto como una empresa de software.

### Gestión de leads

Todo prospecto debería comenzar como `Lead`, independientemente de si llegó por formulario, llamada, redes sociales o recomendación.

Campos principales:

```text
Lead
- id
- firstName
- lastName
- phone
- email
- preferredLanguage
- source
- sourceDetail
- interestedServiceId
- status
- assignedTo
- nextFollowUpAt
- lastContactAt
- notes
- createdAt
- convertedAt
```

Fuentes sugeridas:

```text
WEBSITE
FACEBOOK
INSTAGRAM
TIKTOK
WHATSAPP
REFERRAL
GOOGLE
PHONE
WALK_IN
OTHER
```

Pipeline:

```text
NEW
 ↓
CONTACT_PENDING
 ↓
CONTACTED
 ↓
QUALIFIED
 ├──→ FOLLOW_UP
 ├──→ QUOTE_SENT
 ├──→ LOST
 └──→ CONVERTED
```

No eliminaría un lead al convertirlo. El sistema debería registrar:

```text
Lead #134
   ↓ convertedAt
Client #95
```

Eso mantiene la atribución comercial: después será posible responder “¿cuántos clientes me produjo Instagram este mes?”.

La competencia valida la importancia de reducir la fricción entre adquisición y solicitud. eFunding Experts utiliza una aplicación inicial corta y comunica un proceso de aplicación, evaluación y funding claramente dividido en etapas. citeturn1search2turn1search12

### Gestión de clientes

Una vez convertido:

```text
Client
- id
- firstName
- middleName
- lastName
- dateOfBirth
- phone
- secondaryPhone
- email
- preferredLanguage
- addressLine1
- addressLine2
- city
- state
- zipCode
- identityType
- taxIdLast4
- leadId
- assignedTo
- status
- createdAt
```

Para SSN/ITIN recomiendo **no mostrar el identificador completo en listados ni almacenarlo en texto plano**. Incluso si el proceso requiere conservarlo, la interfaz debería mostrar algo como:

```text
SSN: •••-••-1234
```

El valor completo debe quedar restringido a las funciones que genuinamente lo requieran y a usuarios autorizados.

La ficha del cliente tendría pestañas:

```text
Resumen
Servicios
Actividad
Tareas
Documentos
Pagos
Notas
Testimonios
```

Y arriba:

```text
María López
Cliente activo

Teléfono       (xxx) xxx-1234
Email          maria@...
Origen         Instagram
Responsable    Juana
Cliente desde  10 ago 2026

Servicios activos
[ Reparación de crédito ] [ Comprador de casa ]
```

### Expedientes de servicio

Esta es la pieza que probablemente más necesitas agregar o refactorizar.

```text
Service
- id
- name
- code
- description
- active
```

Por ejemplo:

```text
CREDIT_REPAIR
HOME_BUYER
BUSINESS_CREDIT
PERSONAL_LOAN
WEB_DEVELOPMENT
CRM_DEVELOPMENT
```

Después:

```text
ServiceCase
- id
- clientId
- serviceId
- caseNumber
- status
- stage
- assignedTo
- startedAt
- targetDate
- nextActionAt
- completedAt
- quotedAmount
- agreedAmount
- notes
- createdAt
- updatedAt
```

Cada `ServiceCase` tendría un timeline.

```text
10 Sep 10:32
Noel creó el expediente.

10 Sep 11:05
Cliente subió identificación.

12 Sep 09:42
Reporte de crédito agregado.

14 Sep 13:22
Primera ronda enviada.

14 Sep 13:23
Seguimiento programado para 14 Oct.

14 Oct 09:00
Tarea vencida: Revisar respuesta.
```

El cliente repetidamente pidió saber “lo último que se hizo”. Eso no debe depender de que alguien escriba manualmente una nota. **Los eventos importantes tienen que crear actividades automáticamente.**

### Tareas y recordatorios

Modelo:

```text
Task
- id
- clientId?
- serviceCaseId?
- assignedTo
- title
- description
- priority
- status
- dueAt
- reminderAt
- completedAt
- createdBy
```

Estados:

```text
TODO
IN_PROGRESS
DONE
CANCELED
```

El dashboard debe contestar tres preguntas apenas el usuario abre el sistema:

> **¿Qué tengo que hacer hoy?**  
> **¿Qué está atrasado?**  
> **¿Qué clientes están esperando seguimiento?**

Ejemplo:

```text
HOY

⚠ 5 seguimientos vencidos
○ Revisar reporte de María López
○ Llamar a José Hernández
○ Solicitar identificación a Ana Ruiz

PRÓXIMOS
14 Oct — Revisar ronda #1 / María López
15 Oct — Seguimiento préstamo / Carlos García
17 Oct — Revisión proyecto web / ABC Cleaning
```

### Documentos

No guardaría archivos binarios dentro de MySQL. La BD debería guardar metadatos y el archivo vivir en almacenamiento privado.

```text
Document
- id
- clientId
- serviceCaseId?
- category
- fileName
- storageKey
- mimeType
- size
- uploadedBy
- uploadedAt
```

Categorías:

```text
ID
PROOF_OF_ADDRESS
CREDIT_REPORT
DISPUTE_LETTER
BUREAU_RESPONSE
CONTRACT
INVOICE
RECEIPT
BANK_DOCUMENT
BUSINESS_DOCUMENT
OTHER
```

Debería existir una checklist por servicio:

```text
Documentos de onboarding

✓ Identificación
✓ Comprobante de domicilio
✓ Reporte inicial
○ Contrato firmado
○ Documento adicional
```

### Notas y actividades

Separaría **nota humana** de **actividad del sistema**.

```text
Note
- body
- author
- visibility
- createdAt
```

frente a:

```text
Activity
- type
- entityType
- entityId
- metadata
- actorId
- createdAt
```

Esto hace que el timeline sea confiable.

### Cotizaciones y pagos

No necesitas empezar construyendo QuickBooks dentro del CRM.

MVP:

```text
Quote
- id
- clientId
- serviceCaseId
- quoteNumber
- amount
- status
- expiresAt
- notes
```

Estados:

```text
DRAFT
SENT
ACCEPTED
REJECTED
EXPIRED
```

Y:

```text
Payment
- id
- serviceCaseId
- amount
- method
- reference
- paymentDate
- status
- notes
```

Métodos iniciales:

```text
CARD
ZELLE
CASH
BANK_TRANSFER
OTHER
```

El sistema calcula:

```text
Servicio       $1,000
Pagado           $500
Pendiente        $500
```

Esto es mejor que simplemente un campo booleano `isPaid`.

NCA, por ejemplo, publica precios y alternativas de pago para algunos servicios, lo que refuerza que el CRM debe permitir paquetes y pagos flexibles en vez de asumir que todo servicio tiene un único precio fijo. citeturn1search5

## Flujo de trabajo de cada servicio

Aquí es donde convertiría las reuniones en reglas concretas para desarrollo.

### Reparación de crédito

Este es el workflow más importante y debe recibir la mayor parte del esfuerzo.

```text
LEAD
  ↓
CONSULTA
  ↓
CLIENTE
  ↓
EXPEDIENTE DE REPARACIÓN
  ↓
ONBOARDING
  ↓
DOCUMENTOS
  ↓
REPORTE INICIAL
  ↓
ANÁLISIS DE CUENTAS / ELEMENTOS
  ↓
RONDA DE DISPUTA
  ↓
ESPERANDO RESPUESTA
  ↓
REVISIÓN DE RESULTADO
  ↓
¿QUEDAN ELEMENTOS QUE REQUIEREN TRABAJO?
   ├── Sí → Nueva ronda cuando corresponda
   └── No → Cierre
  ↓
REPORTE FINAL
  ↓
COMPLETADO
  ↓
SOLICITAR TESTIMONIO
```

No crearía columnas como:

```text
round1Date
round2Date
round3Date
```

Eso sería una mala decisión.

Debe ser:

```text
CreditCase
  ↓
DisputeRound[]
```

Así pueden existir cero, una, tres, seis o las rondas que correspondan.

Modelo:

```text
CreditCase
- id
- serviceCaseId
- initialReportDate
- nextReviewAt
- status
- goals
```

Reporte:

```text
CreditReport
- id
- creditCaseId
- reportDate
- provider
- experianScore?
- equifaxScore?
- transunionScore?
- documentId?
- notes
```

Los puntajes deben permitir `null`, porque no deberías asumir que siempre habrá tres scores disponibles.

Elementos del reporte:

```text
CreditItem
- id
- creditCaseId
- creditorName
- accountReference
- bureau
- category
- status
- balance?
- reportedDate?
- disputeStatus
- notes
```

Una cuenta podría estar reportada en más de un buró. Para no duplicar incorrectamente el concepto de “cuenta”, incluso puedes evolucionar después hacia:

```text
Tradeline
   ├── BureauItem: Experian
   ├── BureauItem: Equifax
   └── BureauItem: TransUnion
```

Ronda:

```text
DisputeRound
- id
- creditCaseId
- roundNumber
- preparedAt
- sentAt
- expectedReviewAt
- reviewedAt
- status
- notes
```

Elementos de la ronda:

```text
DisputeRoundItem
- disputeRoundId
- creditItemId
- bureau
- reason
- action
- outcome
```

Entonces una pantalla podría verse:

```text
Reparación de crédito
María López

Score inicial       Actual
Experian   580       642
Equifax    574       630
TransUnion 590       651

Rondas
#1  Enviada 12/08    Revisada 15/09    Completada
#2  Enviada 18/09    Revisión 18/10    Esperando

Elementos
Capital One      Experian    En disputa
ABC Collections  Equifax     Eliminado/corregido
XYZ Account      TransUnion  Pendiente de revisión
```

Hay además una razón de cumplimiento para ser preciso con esta información: el CFPB señala que los consumidores tienen derecho a disputar información inexacta y que la información negativa correcta generalmente no puede simplemente eliminarse. La interfaz, plantillas y marketing del CRM no deberían expresar promesas como “eliminaremos cualquier elemento negativo”, sino documentar qué información se está cuestionando, por qué y con qué soporte. citeturn1search1turn1search4turn1search3

### Asesoría para compradores de casa

No necesita toda la complejidad del módulo de crédito, pero puede relacionarse con él.

```text
CONSULTA
 ↓
EVALUACIÓN DE CRÉDITO
 ↓
OBJETIVO DE COMPRA
 ↓
PLAN DE PREPARACIÓN
 ↓
SEGUIMIENTO
 ↓
LISTO PARA REFERENCIA / PRECALIFICACIÓN
 ↓
REFERIDO
 ↓
CIERRE / COMPLETADO
```

Campos:

```text
HomeBuyerCase
- serviceCaseId
- targetPurchaseDate
- targetScore?
- targetBudget?
- realtorName?
- realtorPhone?
- lenderName?
- lenderPhone?
- readinessStatus
- nextReviewAt
```

No convertiría el CRM en un sistema hipotecario. El objetivo es **dar seguimiento a la preparación del cliente**.

La pantalla puede decir:

```text
Meta: Compra de vivienda
Estado: Preparando crédito

Reparación relacionada:
CR-2026-0041

Score meta:
680

Próxima revisión:
15 noviembre

Realtor:
Pendiente

Tareas:
✓ Reporte inicial
✓ Reducir utilización / plan definido
○ Revisar actualización
○ Referir a realtor/lender
```

### Crédito y funding empresarial

Como LLC está fuera de alcance, iniciaría cuando el negocio ya exista o cuando solamente se necesite evaluar financiamiento.

```text
CONSULTA
 ↓
PERFIL DEL NEGOCIO
 ↓
EVALUACIÓN
 ↓
DOCUMENTOS
 ↓
PRODUCTO / OPCIONES
 ↓
APLICACIÓN
 ↓
EN REVISIÓN
 ↓
APROBADO / RECHAZADO
 ↓
FUNDED
```

Es muy parecido al modelo público de eFunding Experts: aplicación, preaprobación/matching y funding. Su producto además enfatiza seguimiento de deals, lo que confirma que aquí conviene modelar cada oportunidad de financiamiento como un objeto rastreable, y no enterrarla en notas del cliente. citeturn1search2turn1search12

Modelo básico:

```text
FundingCase
- serviceCaseId
- businessName
- requestedAmount
- purpose
- status
- nextFollowUpAt
```

Y ofertas/aplicaciones:

```text
FundingApplication
- id
- fundingCaseId
- providerName
- productType
- requestedAmount
- approvedAmount?
- status
- submittedAt
- decisionAt?
- fundedAt?
- notes
```

Esto habilita:

```text
Solicitado: $50,000

Lender A    En revisión
Lender B    Rechazado
Lender C    Aprobado $35,000
```

Sin necesidad de integrar APIs de lenders en el MVP.

### Préstamos personales

Pipeline corto:

```text
NUEVO
 ↓
EVALUACIÓN
 ↓
DOCUMENTOS
 ↓
APLICACIÓN
 ↓
EN REVISIÓN
 ↓
APROBADO / RECHAZADO
 ↓
FUNDED
```

Campos específicos:

```text
PersonalLoanCase
- requestedAmount
- purpose?
- provider?
- applicationDate?
- approvedAmount?
- fundedAmount?
- status
- nextFollowUpAt
```

No almacenaría en esta primera versión información financiera adicional que el negocio no esté utilizando operacionalmente.

### Páginas web y CRM

Aquí puedes aprovechar el mismo `ServiceCase` sin construir un gestor de proyectos completo.

```text
DISCOVERY
 ↓
QUOTE
 ↓
ACCEPTED
 ↓
WAITING_CONTENT
 ↓
IN_DEVELOPMENT
 ↓
CLIENT_REVIEW
 ↓
REVISION
 ↓
DELIVERED
 ↓
COMPLETED
```

Campos:

```text
ProjectCase
- serviceCaseId
- projectType
- projectName
- domain?
- startDate
- estimatedDeliveryDate?
- deliveryDate?
- stage
```

Tareas y documentos universales hacen el resto.

### Testimonios

El nuevo requerimiento de testimonios debería implementarse en dos lados:

**CRM interno**

```text
Client → Testimonials → Nuevo
```

y **sitio público**

```text
API/CMS del CRM
      ↓
testimonios aprobados
      ↓
sección de testimonios del website
```

Modelo:

```text
Testimonial
- id
- clientId
- serviceCaseId?
- clientDisplayName
- text
- rating?
- mediaUrl?
- status
- consentAt
- featured
- sortOrder
- publishedAt?
```

Estados:

```text
DRAFT
PENDING_APPROVAL
APPROVED
PUBLISHED
REJECTED
```

**No publicaría automáticamente un comentario creado desde la ficha del cliente.** Conviene registrar consentimiento y aprobación.

El patrón comercial está justificado: eFunding Experts coloca resultados/testimonios de clientes directamente en su página de conversión, próximos a sus llamadas a solicitar funding. citeturn1search2

## Modelo de datos y arquitectura recomendada

La siguiente sería mi arquitectura de dominio objetivo para tu Next.js + MySQL.

```text
User
Role
│
├──────────── assigned ────────────┐
│                                  │
Lead ── converts to ── Client      │
                       │           │
                       ├── ServiceCase ─────────────┐
                       │       │                    │
                       │       ├── Task             │
                       │       ├── Document         │
                       │       ├── Note             │
                       │       ├── Activity         │
                       │       ├── Quote            │
                       │       └── Payment          │
                       │                            │
                       ├── CreditCase               │
                       │      ├── CreditReport      │
                       │      ├── CreditItem        │
                       │      └── DisputeRound      │
                       │            └── RoundItem   │
                       │
                       ├── HomeBuyerCase
                       │
                       ├── FundingCase
                       │      └── FundingApplication
                       │
                       ├── PersonalLoanCase
                       │
                       ├── ProjectCase
                       │
                       └── Testimonial
```

Una posible traducción a MySQL/ORM sería:

```text
users
roles

leads
lead_activities

clients
services
service_cases

tasks
notes
activities
documents

quotes
quote_items
payments

credit_cases
credit_reports
credit_items
dispute_rounds
dispute_round_items

home_buyer_cases

funding_cases
funding_applications

personal_loan_cases

project_cases

testimonials

audit_logs
```

### Distinción crítica entre `status` y `stage`

Yo utilizaría ambos.

`status` responde:

> ¿El expediente está abierto o cerrado?

```text
OPEN
ON_HOLD
COMPLETED
CANCELED
```

`stage` responde:

> ¿Dónde se encuentra dentro del proceso?

Por ejemplo, reparación:

```text
ONBOARDING
WAITING_DOCUMENTS
REPORT_REVIEW
PREPARING_DISPUTE
WAITING_BUREAU_RESPONSE
RESULT_REVIEW
```

Funding:

```text
QUALIFICATION
WAITING_DOCUMENTS
APPLICATION
UNDER_REVIEW
APPROVED
FUNDED
```

Eso evita un gigantesco enum con 30 estados incompatibles.

### No hagas que los pipelines sean demasiado rígidos

En la primera versión puedes almacenar `stage` como enum por cada módulo, pero pensando a futuro yo evolucionaría hacia:

```text
service_workflows
workflow_stages
service_case_stage_history
```

Así la administradora podría configurar:

```text
Reparación de Crédito

1. Onboarding
2. Documentos
3. Analizar reporte
4. Preparar ronda
5. Esperando respuesta
6. Revisar resultados
7. Completar
```

sin tocar código.

Para el MVP, no necesitas todavía construir ese diseñador visual. Sólo evita una estructura de DB que haga imposible agregarlo.

### Historial de etapas

Agrega:

```text
ServiceCaseStageHistory
- id
- serviceCaseId
- fromStage
- toStage
- changedBy
- changedAt
```

Con esto puedes saber:

```text
¿Cuánto tarda una reparación?
¿Dónde se atascan los expedientes?
¿Cuántos llevan más de 40 días esperando?
¿Quién cambió el estado?
```

### Dashboard

No diseñaría el dashboard primordialmente con gráficas bonitas.

El dashboard de este cliente debe priorizar **operaciones**.

Primera fila:

| Indicador | Ejemplo |
|---|---:|
| Nuevos leads | 14 |
| Leads por contactar | 8 |
| Clientes activos | 37 |
| Tareas vencidas | 6 |
| Seguimientos hoy | 9 |
| Esperando documentos | 4 |

Después:

```text
REQUIERE ATENCIÓN

María López
Reparación de crédito
Ronda #2 necesita revisión
Vencido hace 2 días
[Abrir]

Carlos Pérez
Funding empresarial
Esperando documentos
Último contacto hace 8 días
[Abrir]
```

Después pipeline:

```text
LEADS
Nuevos     Contactados     Seguimiento     Cotización     Convertidos
  12            8               6               4              11
```

Y posteriormente métricas.

### Búsqueda global

Esto será muy útil:

```text
Buscar: María
```

Resultado:

```text
CLIENTE
María López
(312) ...

EXPEDIENTE
CR-2026-043 · Reparación de crédito

DOCUMENTO
Credit Report - Sep 2026
```

### Rutas del frontend

Un mapa de navegación razonable:

```text
/dashboard

/leads
/leads/[id]

/clients
/clients/[id]

/cases
/cases/[id]

/tasks

/payments
/quotes

/testimonials

/settings
/settings/services
/settings/users
```

Dentro del expediente de crédito:

```text
/cases/[id]
  Resumen
  Reportes
  Elementos
  Rondas
  Documentos
  Tareas
  Pagos
  Actividad
```

No crearía un menú superior independiente para absolutamente cada pequeña entidad. El expediente debe ser la experiencia principal.

### APIs o Server Actions

A nivel lógico, necesitas operaciones equivalentes a:

```text
createLead()
updateLead()
convertLeadToClient()

createClient()
updateClient()

createServiceCase()
changeServiceCaseStage()
completeServiceCase()

createTask()
completeTask()

uploadDocument()

addNote()

createQuote()
recordPayment()

createCreditReport()
createCreditItem()
createDisputeRound()
completeDisputeRound()
scheduleCreditReview()

createTestimonial()
approveTestimonial()
publishTestimonial()
```

La operación `convertLeadToClient()` debería ejecutarse en una transacción:

```text
BEGIN

create Client
link original Lead
mark Lead as CONVERTED
create initial ServiceCase
create Activity records

COMMIT
```

No permitas quedar con un lead marcado convertido pero sin cliente porque una operación falló a mitad.

## Backlog de desarrollo y criterios de aceptación

Yo dividiría el proyecto por verticales funcionales, no por “primero hago todo el frontend y después toda la base de datos”.

### Primera entrega: núcleo comercial

Construye:

```text
Leads
→ Seguimientos
→ Conversión
→ Clientes
→ Expedientes
→ Dashboard básico
```

**Resultado demostrable:**

> Un lead llega de Instagram, la administradora lo registra, agenda una llamada, cambia su estado, lo convierte en cliente y crea un expediente de reparación de crédito.

Criterios de aceptación:

| Caso | Resultado esperado |
|---|---|
| Crear lead | Aparece inmediatamente en pipeline |
| Asignar fuente Instagram | Se conserva al convertir |
| Programar seguimiento | Aparece en tareas próximas |
| Convertir lead | Crea cliente sin duplicar contacto |
| Convertir | Lead pasa a `CONVERTED` |
| Seleccionar servicio | Crea `ServiceCase` |
| Cliente con dos servicios | Ambos aparecen de forma independiente |

Éste es el primer hito que deberías mostrar al cliente.

### Segunda entrega: operación diaria

Agregar:

```text
Tasks
Notes
Activity timeline
Documents
Next Action
Due dates
```

Criterio clave:

> Al abrir cualquier expediente, el usuario debe poder responder en menos de unos segundos qué se hizo por última vez y qué toca hacer después.

Ficha:

```text
Última actividad
14 Sep — Se envió ronda #1

Próxima acción
14 Oct — Revisar respuesta

Responsable
Juana

Pendientes
2 documentos
1 tarea
```

### Tercera entrega: reparación de crédito

Agregar todo el vertical:

```text
CreditCase
CreditReport
CreditItem
DisputeRound
DisputeRoundItem
Credit timeline
```

Caso de aceptación completo:

```text
Cliente nuevo
  ↓
Carga reporte inicial
  ↓
Registra tres elementos a revisar
  ↓
Crea ronda #1
  ↓
Selecciona dos elementos
  ↓
Marca ronda enviada
  ↓
Sistema solicita/agrega fecha de revisión
  ↓
Crea recordatorio
  ↓
Llegada la fecha aparece en dashboard
  ↓
Empleado registra resultado
  ↓
Un elemento se marca resuelto
  ↓
El otro puede incluirse en otra ronda
```

**Eso representa el verdadero corazón del CRM.**

El CFPB recomienda que las disputas identifiquen cada error, expliquen la razón y adjunten documentación pertinente, por lo que `DisputeRoundItem` debería conservar qué elemento se disputó, el motivo y documentos asociados. citeturn1search1

### Cuarta entrega: ventas y cobranza

Agregar:

```text
Quotes
Payments
Balance
Payment history
```

No automatices Zelle. Registra:

```text
$250
Zelle
Reference: ...
Received: Sep 18
Entered by: Juana
```

La integración con Stripe u otro procesador puede llegar después.

Hay una consideración regulatoria muy importante antes de automatizar cobros para reparación de crédito. La FTC recuerda en una publicación de enero de 2026 que las empresas de reparación de crédito deben utilizar contratos que expliquen derechos y costos, reconocer el derecho federal de cancelación de tres días y no cobrar por anticipado antes de prestar la ayuda correspondiente; históricamente la agencia ha emprendido acciones precisamente por cobros anticipados y omisiones contractuales bajo CROA. citeturn1search16turn1search7

Por eso, para **reparación de crédito**, yo incorporaría al modelo:

```text
Contract
- serviceCaseId
- contractVersion
- sentAt
- signedAt
- cancellationDeadline
- canceledAt?
- status
```

y separaría:

```text
servicio contratado
servicio realizado
factura/cargo
pago
```

No programaría automáticamente “aceptó → cobrar $X” sin que el abogado/compliance del negocio confirme exactamente su modelo contractual y las reglas federales y estatales que le aplican.

### Quinta entrega: servicios secundarios

Después:

```text
HomeBuyerCase
FundingCase
FundingApplication
PersonalLoanCase
ProjectCase
```

No antes.

El error sería dedicar una semana a una calculadora bonita de funding mientras el cliente todavía no puede saber qué reparación de crédito debe revisar hoy.

### Sexta entrega: testimonios y automatizaciones

Agregar:

```text
testimonial CRUD
consentimiento
featured
publicación
endpoint público
```

Luego:

```text
emails
SMS
WhatsApp
automatic reminders
website lead webhook
payment processor
```

### Priorización final

| Prioridad | Feature |
|---|---|
| **P0** | Leads |
| **P0** | Clientes |
| **P0** | Service Cases |
| **P0** | Pipeline/status/stage |
| **P0** | Tasks / next action |
| **P0** | Timeline |
| **P0** | Reparación de crédito |
| **P0** | Rondas |
| **P0** | Documentos |
| **P1** | Reportes de crédito |
| **P1** | Cotizaciones |
| **P1** | Pagos |
| **P1** | Home buyer |
| **P1** | Funding |
| **P1** | Personal loans |
| **P1** | Web/CRM projects |
| **P1** | Testimonios |
| **P2** | Email automático |
| **P2** | SMS/WhatsApp |
| **P2** | Formularios web automáticos |
| **P2** | Procesamiento online de pagos |
| **P2** | Reportes/analytics avanzados |
| **P3** | Comisiones/afiliados |
| **P3** | Integraciones con proveedores de crédito |
| **Fuera ahora** | LLC |

## Seguridad, cumplimiento y reglas que no debes dejar para el final

Aquí el CRM se diferencia de un CRM para una barbería o agencia de marketing. Estás manejando potencialmente identificación personal, direcciones, reportes de crédito, SSN/ITIN, contratos y documentación financiera.

La seguridad debe formar parte del MVP.

### Roles

Como mínimo:

```text
ADMIN
AGENT
VIEWER
```

Después pueden crecer a:

```text
FINANCE
MANAGER
```

Ejemplo de permisos:

| Acción | Admin | Agent | Viewer |
|---|:---:|:---:|:---:|
| Ver clientes | ✓ | ✓ | ✓ |
| Editar cliente | ✓ | ✓ | — |
| Ver SSN completo | Configurable | — | — |
| Ver documentos sensibles | ✓ | ✓ | Configurable |
| Registrar ronda | ✓ | ✓ | — |
| Registrar pago | ✓ | Configurable | — |
| Eliminar expediente | ✓ | — | — |
| Administrar usuarios | ✓ | — | — |
| Publicar testimonial | ✓ | — | — |

### Auditoría

Para acciones sensibles:

```text
AuditLog
- userId
- action
- entityType
- entityId
- metadata
- ipAddress?
- createdAt
```

Ejemplo:

```text
Sep 18 10:41
juana@...
VIEW_SENSITIVE_ID
Client #443
```

o:

```text
Sep 18 11:03
admin@...
PAYMENT_UPDATED
$250 → $500
```

### Nada de eliminación destructiva accidental

Para clientes y expedientes:

```text
archivedAt
deletedAt
```

en vez de borrar físicamente datos mediante un botón común.

Especialmente:

```text
payments
dispute rounds
contracts
activities
audit logs
```

no deberían desaparecer silenciosamente.

### SSN e ITIN

Evita:

```text
<input value="123-45-6789">
```

apareciendo continuamente.

Mejor:

```text
SSN
•••-••-6789

[Ver]
```

con autorización explícita y registro de auditoría.

No uses SSN como:

```text
username
public id
URL slug
searchable public parameter
log message
analytics property
```

### Documentos

El acceso debería ser del tipo:

```text
usuario autenticado
    ↓
validar permiso
    ↓
generar acceso temporal
    ↓
archivo privado
```

no:

```text
https://tu-storage.com/clientes/ssn-credit-report.pdf
```

público permanentemente.

### Consideraciones específicas de reparación de crédito

Hay tres reglas de producto que incorporaría expresamente.

**El CRM no debe presentar como hecho que todo elemento negativo puede borrarse.** El CFPB señala que la información negativa que sea correcta generalmente no puede eliminarse simplemente por ser negativa. citeturn1search4turn1search3

**Cada disputa debe documentar su fundamento.** El CFPB indica que al disputar errores deben identificarse los elementos cuestionados, explicarse el problema y acompañarse de documentación pertinente. citeturn1search1

**El módulo contractual y de cobros necesita revisión legal antes de automatizarlo.** La FTC señala actualmente obligaciones específicas para empresas de reparación de crédito, incluyendo contrato, información sobre derechos, cancelación y restricciones sobre cobros anticipados. citeturn1search16turn1search7

El CRM debería facilitar compliance, no decidir jurídicamente si una disputa es válida. Por ejemplo:

```text
Motivo de disputa *
[________________________]

Documentación de soporte
[Agregar archivo]

Buró
[ExperIAN] [Equifax] [TransUnion]

Elemento
[ABC Collections]

☐ Información revisada por el agente
```

Es mucho más seguro que un botón mágico:

```text
[Disputar todo]
```

### Regla de oro para las rondas

No:

```text
Round 1
wait 30 days
automatically create Round 2
```

Sí:

```text
Round 1 sent
    ↓
nextReviewAt
    ↓
Task
    ↓
Review actual response/report
    ↓
Human determines next action
```

Esto coincide mejor tanto con lo explicado por tu cliente como con el proceso de disputa descrito por el CFPB. citeturn1search1

## Especificación final y recomendación de implementación

Si yo fuera la empresa contratada para rescatar este proyecto, congelaría el alcance con este documento funcional:

> **Objetivo del producto:** centralizar la captación, conversión y administración de clientes de JH Financial, permitiendo administrar uno o varios servicios por persona y mantener trazabilidad de tareas, documentos, pagos, comunicaciones y avances específicos de cada servicio.

### Historias de usuario esenciales

| ID | Como… | Necesito… | Para… |
|---|---|---|---|
| CRM-LD | Asesor | registrar un lead con fuente y servicio | saber quién está interesado |
| CRM-LD | Asesor | programar un seguimiento | no perder prospectos |
| CRM-LD | Asesor | convertir un lead | comenzar su servicio |
| CRM-CL | Asesor | consultar ficha del cliente | ver toda su relación con la empresa |
| CRM-SV | Asesor | agregar varios servicios | manejar necesidades simultáneas |
| CRM-SV | Asesor | cambiar etapa del expediente | conocer el avance |
| CRM-TS | Asesor | registrar próxima acción | saber qué hacer después |
| CRM-AC | Asesor | consultar timeline | saber qué se hizo anteriormente |
| CRM-CR | Especialista | registrar reporte de crédito | establecer una línea base |
| CRM-CR | Especialista | registrar elementos del reporte | organizar trabajo |
| CRM-CR | Especialista | crear rondas | dar seguimiento a disputas |
| CRM-CR | Especialista | programar revisión | no olvidar respuestas |
| CRM-DC | Asesor | adjuntar documentos | mantener expediente completo |
| CRM-QT | Asesor | generar cotización | presentar el servicio |
| CRM-PY | Administración | registrar pagos | conocer saldo |
| CRM-HB | Asesor | seguir meta de compra de casa | saber cuándo está listo |
| CRM-FD | Asesor | seguir aplicación de funding | conocer resultado |
| CRM-TSM | Admin | aprobar testimonios | publicarlos en el sitio |
| CRM-DB | Admin | ver vencimientos | priorizar trabajo diario |

### Definition of Done

Yo no daría un módulo por terminado simplemente porque “ya tiene pantalla”.

**Lead terminado** significa que:

```text
✓ se crea
✓ se edita
✓ se asigna
✓ tiene fuente
✓ tiene interés
✓ tiene seguimiento
✓ aparece en dashboard
✓ mantiene historial
✓ se convierte sin duplicación
✓ puede marcarse perdido
```

**Reparación de crédito terminada** significa que:

```text
✓ crea expediente
✓ recibe documentos
✓ registra reporte
✓ registra elementos
✓ crea ronda
✓ relaciona elementos con ronda
✓ almacena fecha de envío
✓ agenda revisión
✓ crea tarea
✓ registra respuesta
✓ registra resultado
✓ permite ronda siguiente
✓ permite finalizar
✓ conserva timeline
```

**Pago terminado** significa:

```text
✓ registra monto
✓ registra método
✓ registra fecha
✓ registra servicio
✓ permite varios pagos
✓ calcula total pagado
✓ calcula saldo
✓ conserva historial
```

### Flujo operativo final que deberías enseñarle al cliente

Este es probablemente el diagrama más importante de todo el proyecto:

```text
                       ┌────────────────────┐
Facebook ─────────────▶│                    │
Instagram ────────────▶│                    │
TikTok ───────────────▶│       LEADS        │
Website ──────────────▶│                    │
Referido ─────────────▶│                    │
                       └─────────┬──────────┘
                                 │
                       Contactar / Follow-up
                                 │
                         ¿Contrata servicio?
                           │            │
                          NO           SÍ
                           │            │
                    Lost/Nurture        ▼
                                  ┌───────────┐
                                  │  CLIENTE  │
                                  └─────┬─────┘
                                        │
                              Crear expediente
                                        │
                 ┌──────────────────────┼─────────────────────┐
                 │                      │                     │
                 ▼                      ▼                     ▼
        Reparación Crédito         Home Buyer             Funding
                 │                      │                     │
          Reporte inicial        Meta crediticia       Calificación
                 │                      │                     │
          Items a revisar         Seguimientos          Documentos
                 │                      │                     │
             Ronda #1            Preparación            Aplicación
                 │                      │                     │
       Esperar / seguimiento       Referencia          En revisión
                 │                      │                     │
          Revisar resultado        Completo        Approved/Funded
                 │
        ¿Requiere más trabajo?
            │            │
           SÍ           NO
            │            │
       Nueva ronda    Completar
            │            │
            └────────────┘
                 │
                 ▼
        ┌─────────────────┐
        │ SERVICIO CERRADO│
        └────────┬────────┘
                 │
                 ▼
         Solicitar testimonio
                 │
                 ▼
        Aprobar / Publicar
```

En paralelo, **todos** los servicios comparten:

```text
       ┌───────────────┐
       │  ServiceCase  │
       └───────┬───────┘
               │
     ┌─────────┼──────────┬───────────┬───────────┐
     ▼         ▼          ▼           ▼           ▼
   Tasks    Documents    Notes      Quotes      Payments
     │
     ▼
Reminders
     │
     ▼
Dashboard
```

Ésa es la arquitectura que te faltaba descubrir en las reuniones.

### Qué conservar y qué modificar de tu CRM existente

Sin afirmar detalles archivo por archivo que no quedaron validados durante la auditoría del repositorio, la estrategia correcta sería esta:

| Si tu CRM actual ya tiene… | Acción |
|---|---|
| Login/auth | **Conservar** |
| Usuarios | **Conservar y agregar roles** |
| Sidebar/layout | **Conservar** |
| Dashboard | **Refactorizar datos** |
| Clientes | **Conservar UI; refactorizar modelo** |
| Leads | **Conservar/mejorar pipeline** |
| Notas | **Relacionarlas también con `ServiceCase`** |
| Documentos | **Relacionarlos con cliente + expediente** |
| Pagos | **Relacionarlos con expediente** |
| Servicio como columna de cliente | **Reemplazar por relación uno-a-muchos** |
| Estado único del cliente | **Separar de status/stage del expediente** |
| Rondas fijas | **Reemplazar por tabla `DisputeRound`** |
| Campos Round1/Round2/Round3 | **Eliminar/refactorizar** |
| Recordatorios | **Vincular a tareas y `nextActionAt`** |
| Calendario | **Alimentarlo desde tasks/reminders** |
| Cotizaciones | **Conservar y relacionar con expediente** |
| CRM genérico | **Convertir gradualmente en case-management CRM** |

El cambio estructural mínimo imprescindible es:

```diff
 Client
- service
- serviceStatus
- currentRound
+ serviceCases[]
```

y después:

```text
ServiceCase
+ service
+ status
+ stage
+ assignedTo
+ nextActionAt
+ startedAt
+ completedAt
```

Para reparación:

```text
ServiceCase
    1
    │
    1
CreditCase
    │
    ├── * CreditReport
    ├── * CreditItem
    └── * DisputeRound
             │
             └── * DisputeRoundItem
```

**Si haces solamente esta refactorización conceptual antes de continuar construyendo pantallas, el resto del CRM empieza a acomodarse.**

### Decisiones que puedes asumir para seguir desarrollando sin volver a atorarte

Hasta que el cliente indique lo contrario, yo congelaría estos defaults:

| Tema pendiente | Default de desarrollo |
|---|---|
| Número de rondas | Ilimitado/configurable |
| Seguimiento de ronda | Fecha manual sugerida, nunca hardcodeada |
| WhatsApp/SMS | Sólo campo/tarea por ahora |
| Email automático | Fase posterior |
| Zelle | Registro manual |
| Tarjetas | Registro manual inicialmente |
| Credit Hero Score / proveedor | Sin API en MVP |
| Reporte de crédito | Carga manual + campos resumen |
| LLC | Desactivado |
| Comisiones | Fuera del MVP |
| Varios servicios por cliente | Sí |
| Un responsable por expediente | Sí |
| Documentos | Privados |
| SSN/ITIN | Protegido y enmascarado |
| Testimonio | Requiere aprobación/consentimiento |
| Pipeline configurable | Diseñar DB para permitirlo; editor visual después |
| Idioma | Preparar UI para español/inglés si el mercado lo requiere |

La competencia secundaria sí demuestra que, si en el futuro el negocio desarrolla una red de referidos o afiliados para funding, podría tener sentido agregar `ReferralPartner`, deals y commissions: eFunding Experts promociona precisamente seguimiento de leads, envío de deals y monitoreo de comisiones dentro de su portal para partners. Eso es una **oportunidad futura**, no una necesidad confirmada de tu cliente actual. citeturn1search0

### Resultado de producto que deberías perseguir

Al terminar el MVP, la dueña debería poder entrar por la mañana y hacer esto:

```text
Dashboard
│
├─ “Tengo 7 personas que debo contactar”
├─ “Tengo 3 rondas que toca revisar”
├─ “Hay 2 clientes esperando documentos”
├─ “Carlos debe $250”
└─ “María terminó su servicio; puedo pedir testimonial”
```

Abrir a María y encontrar:

```text
MARÍA LÓPEZ
Cliente desde agosto 2026
Origen: Instagram

SERVICIOS
┌──────────────────────┬──────────────────────────┐
│ Reparación Crédito   │ Esperando ronda #2       │
│ Comprador de Casa    │ Preparando crédito       │
└──────────────────────┴──────────────────────────┘

PRÓXIMA ACCIÓN
18 octubre
Revisar respuesta de ronda #2

ÚLTIMA ACTIVIDAD
18 septiembre
Se enviaron disputas correspondientes a ronda #2

DOCUMENTOS
6

PAGOS
Total       $1,000
Pagado        $750
Pendiente     $250

TIMELINE
...
```

Cuando tu CRM pueda responder **quién es el cliente, qué contrató, dónde está cada servicio, qué se hizo, qué falta hacer, cuándo toca hacerlo, qué documentos existen y cuánto ha pagado**, habrás construido exactamente el sistema que las dos reuniones están intentando describir.

La arquitectura objetivo puede resumirse en una sola fórmula:

> **`Lead → Client → ServiceCase → Workflow → Tasks/Documents/Payments → Completion → Testimonial`**

Y para el servicio central:

> **`CreditCase → CreditReport → CreditItems → DisputeRounds → Review → Next Action`**

Esa, más que agregar otra pantalla o dashboard, es la modificación fundamental que debería guiar la siguiente iteración de `jh-crm`.