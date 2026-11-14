---
type: spec
title: Spec — Contratos sin XSS por nombre de cliente
description: WHAT and WHY de impedir que datos del cliente ejecuten código en el contrato del portal.
tags: [sdd, spec, security, contracts, portal]
timestamp: 2026-11-14T18:00:00Z
topic: sdd
slug: contrato-xss-nombre-cliente
branch: claude/youthful-leavitt-d8f81e
status: approved
approved_by: Noeli, 2026-11-14 ("I approve")
---

# Spec — Contratos sin XSS por nombre de cliente

> Slug: `contrato-xss-nombre-cliente` · Status: approved · Created: 2026-11-14
> Inherits: [constitution](../constitution.md). Origen: [decisions](../decisions.md), revisión de cierre
> de la tanda 3a del conector MCP (2026-11-14). Documento de trabajo: [ftd](../../ftd/contrato-xss-nombre-cliente.md).

## Problem & why

Al crear un contrato desde una plantilla, el nombre del cliente se insertaba en el HTML sin escapar.
El portal del cliente pinta ese HTML con `dangerouslySetInnerHTML` en la sesión del cliente, y el
filtro (`sanitizeContractHtml`) dejaba pasar `<svg/onload=alert(1)>`. Un nombre hostil (escrito por
staff, por importación o por el conector de Claude) ejecutaría código en el portal.

## Cost of not building it

Cualquiera que pueda escribir el nombre de un cliente (staff, importación, conector de Claude) puede
ejecutar código en la sesión del portal de ese cliente: leer sus datos, firmar en su nombre o
falsear lo que ve antes de firmar.

## The cheapest alternative

Solo escapar el nombre al crear el contrato. Cierra la vía del nombre, pero deja el filtro del
portal con huecos (`/onload=`, reescritura del chip tras filtrar) para el HTML de plantillas y los
contratos ya guardados. Por eso se hace también el endurecimiento del filtro.

## Goals

- Ningún dato del cliente ni de la organización se inserta en crudo en `contentSnapshot`.
- Nada de lo guardado en un contrato se ejecuta en el portal ni en la vista previa del CRM.

## Non-goals / out of scope

- Otros HTML del sistema (cartas, correos).

## Users & context

Staff de JH que crea y envía contratos (botón de la app o conector de Claude) y clientes que los
abren y firman en el portal.

## What the user can do

Staff crea y envía contratos como hoy; el cliente los abre y firma en el portal como hoy.

## What result they get

El contrato muestra el nombre del cliente tal cual, como texto, aunque contenga `<`, `>`, comillas
o código. Nada de eso se ejecuta.

## What it must respect

La plantilla JH v1.0, la firma de la agencia (`data:image/png|jpeg`), los enlaces https y el chip de
variables pendientes se ven igual. Sin cambios de esquema ni de datos; los contratos antiguos con el
nombre en crudo también se pintan inertes. Borrado lógico y sin PII en fixtures, según la constitución.

## How it proves it

`npm run smoke:contract-xss`: filtro sin DB y contratos reales en `jh_gates` con nombres hostiles,
incluido el envío. Falla si vuelve el código anterior (mutantes comprobados). Los smokes de
contratos existentes siguen en verde.

## Behaviour

1. Al crear un contrato, `fillTemplateVariables` sustituye cada token por su valor escapado.
2. El portal filtra el HTML guardado con DOMPurify (configuración explícita: lista cerrada de
   etiquetas y atributos; `data:` solo como imagen PNG/JPEG/GIF/WebP; estilos con `url(`, escapes
   CSS, `image-set(`, `position: fixed|sticky`, etc., fuera) y la vista
   (`presentContractHtml`) filtra su propia salida después de reescribir los chips; el icono del
   chip entra tras filtrar, solo junto a la apertura de un chip.
3. Entrada desmesurada (más de 1 000 000 caracteres o 3 000 aperturas de etiqueta) o cualquier
   error del filtro: se entrega como texto escapado (falla cerrado).

## Acceptance criteria

- Todo valor sustituido en `contentSnapshot` está escapado como HTML.
- El filtro bloquea manejadores `on*=` sin espacio previo (`/onload=`), `javascript:` ofuscado,
  `srcdoc`, `svg`/`math`/`template` y estilos con `expression(`/`url(`.
- La vista filtra su propia salida; no hay reescritura tras el filtro.
- Entrada desmesurada se entrega como texto escapado y sin esperar (topes de «Behaviour»).

## Amendment 2026-11-14 — DOMPurify

La spec aprobada dejaba fuera «un sanitizador basado en parser (DOMPurify o similar)». Tras
construir y revisar un filtro propio (cuatro rondas de tres revisores), Noe decidió usar DOMPurify:
«usa dompurify» (2026-11-14, transmitido por la sesión «Conexión MCP CRM JH con Claude»). Cambia:

- Sale de «out of scope» la dependencia de un sanitizador; se acepta la dependencia
  `isomorphic-dompurify@4.6.0` (publicada 2026-10-16) con `dompurify@3.4.17` (2026-10-12), ambas
  versiones exactas y con más de dos semanas. Arrastra `jsdom@30.1.3` (el portal renderiza también
  en el servidor). Requiere Node `^22.22.2 || ^24.15.0 || >=26`.
- `sanitizeContractHtml` pasa a ser DOMPurify configurado; el escape de valores en
  `fillTemplateVariables` no cambia.
- Coste conocido: con jsdom el filtro es cuadrático con la profundidad del HTML, por eso los topes
  de entrada de «Behaviour». Se probó medir la profundidad leyendo el HTML y se descartó: cada
  diferencia con el parser del navegador era una forma de esquivarlo; queda un tope duro de aperturas
  (peor caso medido: unos 2,3 s con 3 000 niveles reales).

## Assumptions

- Ninguna plantilla real usa comentarios HTML, `<svg>`, `<math>`, estilos con `url(` ni imágenes
  `data:` no rasterizadas (el filtro ahora los quita). La plantilla JH v1.0 no los usa.

## Points to clarify

- Ninguno abierto. La enmienda de DOMPurify queda registrada arriba.
