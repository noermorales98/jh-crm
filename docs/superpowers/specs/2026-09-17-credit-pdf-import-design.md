# CR-PDF-001 — Importación de PDFs de crédito al CRM

Fecha: 2026-09-17  
Proyecto: J&H CRM (`jh-crm`)  
Estado: diseño aprobado (alcance completo: reporte + cliente + progress)

## Problema

Los reportes de crédito y progress reports llegan como PDF. Hoy se guardan como `Document` y el staff copia a mano scores, cuentas y datos personales a `CreditReport` / `Client`. Eso es lento y propenso a error.

## Decisiones cerradas

- Extracción **asistida por IA** (OpenRouter) + **revisión humana obligatoria** antes de escribir.
- No auto-apply.
- Tipos: `CREDIT_BUREAU_REPORT` | `CLIENT_PROGRESS_REPORT` | `UNKNOWN`.
- Bureau report → propuesta de `CreditReport` (`INITIAL`/`UPDATE`/`MANUAL`) + snapshots + items + `documentId`.
- Progress report → `CreditReport` tipo `UPDATE`, provider `"Progress Report PDF"`, solo scores (sin inventar cuentas).
- Cliente: firstName, lastName, address*, DOB, SSN → cifrado vía perfil sensible; en propuesta solo `ssnLast4` (SSN completo solo en tránsito de confirm si el staff lo aporta/marca).
- Texto del PDF primero (`unpdf`); si &lt; ~800 chars útiles, enviar PDF (o chunk) al modelo multimodal / file.
- PDFs largos: chunk (identidad + scores primero; ítems en segundo pase o truncados a 200).
- Permiso: `creditReports.manage`.
- Fuera: APIs de buró (AU-006), OCR multi-vendor, portal self-serve, recrear `ClientProgressReport` outbound desde PDF.

## Flujos

```text
Document PDF en caso
  → analyzeCreditPdf(documentId, caseId)
  → propuesta tipada + warnings + current client diffs
  → UI revisión (checkboxes)
  → confirmCreditPdfImport(...)
  → updateClient / sensitive + createCreditReport(documentId)
```

## Módulos

| Archivo | Rol |
| --- | --- |
| `src/lib/validation/credit-import.ts` | Zod propuesta + confirm |
| `src/server/credit-import/` | extract PDF, AI classify/extract, propose, confirm |
| `src/lib/storage/s3.ts` | `getObjectBytes` |
| `src/actions/credit-import.ts` | Server actions |
| `src/components/credit-reports/analyze-pdf-import.tsx` | UI |
| `scripts/smoke/credit-pdf-import-smoke.ts` | Schema + dry paths |

## Seguridad

- No loguear SSN/DOB/raw PDF text.
- Activity: “Importación PDF confirmada” sin PII.
- Audit en sensitive profile como hoy.
- sanitizeForAI no aplica al payload de extracción (es el input); sí a logs.

## Criterios de done

1. Spec + backlog CR-PDF-001.
2. Analyze devuelve propuesta validada sin escribir.
3. Confirm escribe Client (opt-in) + CreditReport + documentId.
4. UI en ficha crédito.
5. Smoke schema sin OpenRouter obligatorio.
