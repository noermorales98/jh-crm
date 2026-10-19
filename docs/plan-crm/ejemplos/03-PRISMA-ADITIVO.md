# Prisma aditivo: patrón de integración

[Volver al índice](../README.md) · [Migración](../referencias/MIGRACIONES-Y-RECUPERACION.md)

**Fragmentos de diseño, no un schema completo ni una migración lista.** Los nombres de organización, cliente, reporte, relación y proveedor se verifican en T00. Conservar los modelos actuales. Añadir inversas e índices según el esquema real. Verificar límites de índices y relaciones compuestas del proveedor, especialmente si es MySQL.

## Identidad canónica

```prisma
model CanonicalTradeline {
  id                  String   @id @default(cuid())
  organizationId      String
  clientId            String
  creditorNormalized  String
  accountFamily       String
  identityVersion     Int      @default(1)
  createdAt           DateTime @default(now())
  items               CreditItem[]

  @@unique([organizationId, clientId, id])
  @@index([organizationId, clientId])
}
```

En CreditItem existente, conservar y reutilizar `organizationId`/`clientId` si existen; si no existen, diseñar la propagación del scope antes de usar la relación compuesta:

```prisma
// Agregar dentro del modelo real, no declarar otro CreditItem.
canonicalTradelineId String?
canonicalTradeline CanonicalTradeline? @relation(
  fields: [organizationId, clientId, canonicalTradelineId],
  references: [organizationId, clientId, id]
)
ownershipType     String?
openClosedStatus  String?
pastDueAmount     Decimal? @db.Decimal(18, 2)
sourceLocatorJson Json?
fieldQualityJson  Json?
// Índice sugerido dentro del modelo:
@@index([organizationId, clientId, canonicalTradelineId])
```

Los nombres de enums se pueden usar cuando sean coherentes con el proveedor. En este patrón `String` evita asumir enums ya existentes; la frontera debe validar valores. No se pone balance o límite en CanonicalTradeline porque cambian por observación.

## Score y consultas

```prisma
model CreditScoreObservation {
  id                String   @id @default(cuid())
  organizationId    String
  clientId          String
  reportId          String
  bureau            String
  value             Int
  modelFamily       String
  modelVersion      String?
  industryVariant   String?
  scoreDate         DateTime?
  reasonCodesJson   Json?
  sourceLocatorJson Json?
  @@index([organizationId, clientId, reportId, bureau])
}

model CreditInquiry {
  id                String   @id @default(cuid())
  organizationId    String
  clientId          String
  reportId          String
  bureau            String
  creditorName      String
  inquiryDate       DateTime?
  inquiryType       String
  purpose           String
  sourceLocatorJson Json?
  @@index([organizationId, clientId, reportId, bureau])
}
```

T03 completa FK reales hacia Client/CreditReport para impedir asociaciones cruzadas, relaciones inversas, claves de idempotencia y revisión. Estos fragmentos solos no proporcionan esa protección.

## Datos heredados

`score` antiguo no se etiqueta como FICO por defecto. Crear observación con modelo UNKNOWN cuando no exista evidencia. Un contador de inquiries no se transforma en consultas fechadas inventadas. Canonical ID empieza opcional; el backfill revisa y registra antes de vincular.
