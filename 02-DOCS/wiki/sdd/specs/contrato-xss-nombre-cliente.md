---
type: spec
title: Spec — Contratos sin XSS por nombre de cliente
description: WHAT and WHY de impedir que datos del cliente ejecuten código en el contrato del portal.
tags: [sdd, spec, security, contracts, portal]
timestamp: 2026-11-14T18:00:00Z
topic: sdd
slug: contrato-xss-nombre-cliente
branch: claude/youthful-leavitt-d8f81e
status: draft
---

# Spec — Contratos sin XSS por nombre de cliente

> Slug: `contrato-xss-nombre-cliente` · Status: draft (pendiente de aprobación de Noe) · Created: 2026-11-14
> Inherits: [constitution](../constitution.md). Origen: [decisions](../decisions.md), revisión de cierre
> de la tanda 3a del conector MCP (2026-11-14). Documento de trabajo: [ftd](../../ftd/contrato-xss-nombre-cliente.md).

## Problem & why

Al crear un contrato desde una plantilla, el nombre del cliente se insertaba en el HTML sin escapar.
El portal del cliente pinta ese HTML con `dangerouslySetInnerHTML` en la sesión del cliente, y el
filtro (`sanitizeContractHtml`) dejaba pasar `<svg/onload=alert(1)>`. Un nombre hostil (escrito por
staff, por importación o por el conector de Claude) ejecutaría código en el portal.

## Las cuatro preguntas

1. **Qué puede hacer la persona.** Staff crea y envía contratos como hoy (botón o conector); el
   cliente los abre y firma en el portal como hoy.
2. **Qué resultado obtiene.** El contrato muestra el nombre del cliente tal cual, como texto, aunque
   contenga `<`, `>`, comillas o código. Nada de lo escrito en el nombre o en el HTML del contrato se
   ejecuta en el portal ni en la vista previa del CRM.
3. **Qué debe respetar.** La plantilla JH v1.0, la firma de la agencia (`data:image/png|jpeg`), los
   enlaces https y el chip de variables pendientes se ven igual. Sin cambios de esquema ni de datos;
   los contratos antiguos con el nombre en crudo también se pintan inertes. Borrado lógico y sin PII
   en fixtures, según la constitución.
4. **Cómo lo prueba.** `npm run smoke:contract-xss` (filtro sin DB + contratos reales en `jh_gates`
   con nombres hostiles, incluido el envío). El smoke falla si vuelve el código anterior. Los smokes de
   contratos existentes siguen en verde.

## Criterios de aceptación

- Todo valor sustituido en `contentSnapshot` está escapado como HTML.
- El filtro bloquea manejadores `on*=` sin espacio previo (`/onload=`), `javascript:` ofuscado,
  `srcdoc`, `svg`/`math`/`template` y estilos con `expression(`/`url(`.
- La vista (`presentContractHtml`) filtra su propia salida; no hay reescritura tras el filtro.

## Fuera de alcance

- Cambiar el filtro por un sanitizador basado en parser (DOMPurify o similar).
- Otros HTML del sistema (cartas, correos).
