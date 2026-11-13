---
type: guide
title: Conectar Claude con el CRM
description: Cómo encender el conector, conectar Claude (web, escritorio o móvil), qué puede hacer y cómo cortar el acceso.
tags: [claude, mcp, guia]
timestamp: 2026-11-12T00:00:00Z
topic: guias
---

# Conectar Claude con el CRM

El conector deja que Claude lea y cambie datos del CRM con **tu usuario y tu rol**. Usa el estándar
MCP (Model Context Protocol), el «enchufe» con el que Claude usa herramientas de otras aplicaciones.

## 1. Encenderlo (una vez, un administrador)

1. Configuración → **Claude**.
2. En «Conector de la organización», pulsa **Encender conector**.

Mientras esté apagado, nadie puede usar Claude con el CRM. Apagarlo no borra las conexiones: vuelven
a funcionar al encenderlo.

> En el servidor tiene que estar `FEATURE_MCP_CONNECTOR=true` y `NEXT_PUBLIC_APP_URL` con la dirección
> pública del CRM. Si falta la primera, la página dice «no está disponible en esta instalación».

## 2. Conectar Claude (cada persona, una vez)

1. Configuración → Claude → copia la dirección del conector (termina en `/api/mcp`).
2. En Claude, ve a **Conectores** (en Ajustes o Personalizar) y añade un **conector personalizado**
   con esa dirección. En planes de equipo, lo añade una vez quien administra Claude.
3. Pulsa **Conectar**, entra con tu usuario del CRM (con MFA si lo tienes) y pulsa **Permitir**.

La pantalla de consentimiento muestra tu usuario, tu rol y **a dónde volverá** (claude.ai o «este
ordenador» para Claude Desktop/Code). Si el destino no es ese, pulsa Cancelar.

La conexión no caduca. Solo se corta si la revocas, si un administrador apaga el conector, si cambia tu
rol o tu correo, o si tu cuenta se desactiva.

## Qué puede hacer Claude

- **Leer** (`listar`, `ver`, `buscar`): clientes, casos de crédito, casos de servicio, tareas,
  oportunidades y cotizaciones.
- **Escribir**: crear y editar en esas secciones, añadir notas, mover etapas, marcar cotizaciones y
  oportunidades.
- **«Borrar»** = lo mismo que la app: archivar clientes, cancelar tareas y cotizaciones, marcar
  oportunidades como perdidas. Nunca borra de verdad, y antes pide confirmación.
- Siempre con los permisos de tu rol. Un rol de solo lectura solo lee.
- Pagos, recibos, contratos, rondas, disputas y cartas llegarán en las tandas 2 y 3.

## Qué no puede hacer

- Ver SSN/ITIN ni números de cuenta completos (se tapan aunque tu rol los vea en la app).
- Buscar por números de 9 dígitos o de 13 o más (podrían ser SSN o cuentas).
- Cobrar, mover dinero, cambiar usuarios, roles, MFA o claves.

## Auditoría

Cada cambio que hace Claude deja una entrada `mcp.tool.<herramienta>` en la auditoría, con tu usuario,
`via: "claude"` y la conexión. Revocar una conexión o encender/apagar el conector también queda
registrado.

## Cortar el acceso

Configuración → Claude → **Cortar acceso** en la conexión. Los administradores ven y pueden cortar las
conexiones de todo el equipo.
