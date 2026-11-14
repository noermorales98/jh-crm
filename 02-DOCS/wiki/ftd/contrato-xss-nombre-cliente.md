---
branch: claude/youthful-leavitt-d8f81e
status: in-review
date: 2026-11-14
---

# Contratos: nombre de cliente hostil sin XSS en el portal

## Intención

Un cliente con un nombre como `<svg/onload=alert(1)>` no debe poder ejecutar código en el portal
del cliente cuando abre su contrato. Encontrado en la revisión de cierre de la tanda 3a del conector
MCP (ver `../sdd/decisions.md`, 2026-11-14): el problema ya existía con el botón de la app; el
conector solo añade otra vía.

## Alcance

- `createContractFromTemplate` escapa como HTML cada valor que sustituye en `contentSnapshot`
  (`fillTemplateVariables` en `src/lib/contracts/template-variables.ts`). Hoy los únicos tokens son
  `{{clientName}}` y `{{clientFullName}}`. Los datos de la organización en la firma de la agencia ya
  se escapaban (`agencySignatureHtml`).
- `sanitizeContractHtml` (`src/lib/contracts/sanitize.ts`) se endurece: manejadores `on*=` tras
  espacio, `/`, comilla o acento grave; reglas de atributos solo dentro de etiquetas (no toca texto
  escapado); más etiquetas bloqueadas (`svg`, `math`, `template`, `frame`...); URLs
  `javascript:`/`vbscript:`/`data:` con normalización de entidades y espacios (se permite
  `data:image/...;base64` en `src`, que usa la firma); fuera `srcdoc`/`srcset` y estilos con
  `expression(`/`url(`; se repite hasta que no cambia.
- Fuera de alcance: cambiar a un sanitizador por parser (DOMPurify o similar). Sigue siendo un
  filtro por regex; la defensa principal es el escape en origen.

## Checklist

- [x] Escape de los tokens al crear el contrato — smoke `snapshot guarda el nombre escapado`.
- [x] Filtro bloquea `/onload=` y demás vectores — smoke, 14 vectores.
- [x] Snapshots antiguos con el nombre en crudo se pintan inertes — smoke `un snapshot antiguo...`.
- [x] Plantilla JH v1.0, firma `data:image/png` y enlaces https salen intactos — smoke.
- [x] Smoke nuevo `npm run smoke:contract-xss` (DB solo `jh_gates` en 127.0.0.1:3399).
- [x] Smokes de contratos existentes siguen en verde.
- [ ] Revisión de un revisor (tier 1).
- [ ] PR contra `main`; merge solo con el sí de Noe.

## Evidencia (2026-11-14)

- `DATABASE_URL=mysql://root@127.0.0.1:3399/jh_gates npm run smoke:contract-xss` → `[contract-xss] OK`.
- Mutante: con el `replaceAll` en crudo y la regla antigua `\son...`, el smoke falla (11 ✗); al
  restaurar, vuelve a OK.
- `smoke:contract-legal-gate`, `smoke:credit-contracts`, `smoke:contract-gates-db` → OK.
- `npm run typecheck` → sin errores. `eslint` sobre los ficheros tocados → limpio.
- `rsc risk` → tier 1, sin aprobación humana obligatoria.

## Siguiente paso

Revisión y PR. Seguimiento posible: sustituir el filtro por un sanitizador basado en parser.
