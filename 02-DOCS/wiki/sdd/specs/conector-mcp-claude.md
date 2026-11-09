---
type: spec
title: Spec — Conector MCP de JH CRM para Claude
description: WHAT and WHY del conector remoto que deja a Claude leer, crear, editar y borrar datos del CRM.
tags: [sdd, spec, mcp, ai, auth, oauth]
timestamp: 2026-11-09T00:00:00Z
topic: sdd
slug: conector-mcp-claude
status: draft
---

# Spec — Conector MCP de JH CRM para Claude

> Slug: `conector-mcp-claude` · Status: **draft** · Created: 2026-11-09
> Inherits: [constitution](../constitution.md) v1.0.0
> Área delicada (regla 13): toca el inicio de sesión. Va en un PR con tres revisores y tu sí.

## Problem & why
Hoy el equipo solo puede usar la IA dentro del CRM, con un asistente que solo lee.
Para cualquier cambio (crear una tarea, mover un caso, registrar una nota) hay que abrir la pantalla
y hacerlo a mano. El equipo ya trabaja con Claude en la web, el escritorio y el móvil, pero Claude no
puede ver ni tocar el CRM. Copiar y pegar datos entre los dos es lento y arriesga filtrar datos
sensibles.

MCP (Model Context Protocol) es el estándar con el que Claude usa herramientas de otra aplicación.
Un conector MCP del CRM deja a Claude trabajar con los datos de la agencia, con los mismos permisos
que tiene la persona en el CRM.

## Cost of not building it
- Trabajo repetido: cada acción que Claude podría hacer sigue haciéndose a mano.
- Riesgo: el equipo pega datos de clientes en Claude sin la limpieza de datos sensibles del CRM.
- El asistente interno no puede escribir, y ampliarlo para todo sería duplicar lo que Claude ya hace.

## The cheapest alternative
Un token personal que cada persona pega en Claude Desktop o Claude Code. Es más rápido de construir,
pero no funciona en la web de claude.ai ni en el móvil, que es donde trabaja el equipo. Se descarta
como solución final; queda como posible paso intermedio en el plan.

## Goals
- Una persona del equipo conecta Claude (web, escritorio o móvil) al CRM en uno o dos pasos.
- Claude puede **leer, crear, editar y borrar** en todas las secciones del CRM.
- Claude solo puede hacer lo que esa persona puede hacer en la app: mismo rol, mismos permisos, misma
  organización.
- Todo lo que Claude cambia queda en la actividad y la auditoría, marcado como hecho vía Claude.
- La persona o un administrador pueden cortar el acceso de Claude en cualquier momento.

## Non-goals / out of scope
- Un botón dentro del CRM que abra Claude con contexto (descartado por ahora).
- Saltarse reglas de negocio: Claude usa las mismas reglas que la interfaz, no un acceso directo a la
  base de datos.
- Borrados que la app no permite. Pagos, rondas, contratos, actividad y auditoría siguen con borrado
  lógico (regla 17).
- Acceso al portal del cliente. El conector es solo para el equipo de la agencia.
- Ver datos sensibles en claro (SSN/ITIN, cuentas completas), aunque el rol los vea en la app (regla 16).
- Cobrar con tarjeta o mover dinero desde Claude. Registrar un pago manual sí entra si el rol puede.
- Cambiar usuarios, roles, MFA o claves de integraciones desde Claude.
- Reemplazar el asistente interno actual.

## Users & context
- **Equipo de la agencia** (OWNER, ADMIN, SPECIALIST, STAFF, VIEWER): usa Claude para consultar y
  actualizar clientes, casos, tareas, cotizaciones, rondas, cartas y más.
- **Dueña / administrador:** decide quién puede conectar Claude y revisa qué hizo.

## What the user can do
- Desde Configuración, ver la dirección del conector con un botón de copiar y dos pasos de
  instrucciones para añadirlo en Claude.
- En Claude, añadir el conector y pulsar "Conectar": entra con su usuario del CRM (con MFA si lo
  tiene) y autoriza el acceso.
- Pedir a Claude, en lenguaje normal, que busque, liste, cree, edite o borre registros de cualquier
  sección a la que su rol tenga acceso.
- Antes de un borrado, Claude muestra qué va a borrar y pide confirmación.
- Ver en Configuración sus conexiones activas con Claude y revocarlas.
- Un administrador puede ver y revocar las conexiones de toda la organización, y desactivar el
  conector para la organización entera.

## What result they get
- Respuestas de Claude con datos reales del CRM, con enlaces a la pantalla correspondiente.
- Cambios hechos por Claude visibles al instante en el CRM.
- Un error claro y en español cuando falta permiso, el registro no existe o una regla lo impide.

## What it must respect
- Constitución reglas 9 (organización y permisos los decide el servidor), 10 (la IA no calcula ni
  promete), 13 (área delicada), 16 (datos sensibles fuera de prompts), 17 (borrado lógico).
- `docs/02-BUSINESS_RULES.md` y `docs/07-SECURITY.md`.
- Cada acción usa la misma validación y los mismos permisos que su acción en la app.
- El acceso caduca y se puede revocar. Nunca se guarda un secreto en claro.
- Límite de peticiones por persona para que un error de Claude no sature el CRM.

## How it proves it
Pruebas en `scripts/smoke/` que fallan sin el cambio y pasan con él.

## Acceptance criteria
- [ ] AC-1: Sin conexión autorizada, cualquier llamada al conector responde "no autorizado" y no
      devuelve datos.
- [ ] AC-2: Una persona conecta Claude en la web con su usuario del CRM; si tiene MFA, se le pide.
- [ ] AC-3: Claude solo ve datos de la organización de esa persona. Pedir un id de otra organización
      responde "no encontrado".
- [ ] AC-4: Un rol VIEWER puede leer pero cualquier creación, edición o borrado responde "sin permiso".
- [ ] AC-5: Para cada sección del CRM existe al menos lectura; crear, editar y borrar existen donde la
      app los permite, con el mismo permiso.
- [ ] AC-6: Ninguna respuesta del conector contiene SSN/ITIN, números de cuenta completos ni secretos.
- [ ] AC-7: Borrar un pago, ronda o contrato vía Claude hace borrado lógico, igual que en la app.
- [ ] AC-8: Cada cambio hecho vía Claude aparece en actividad y auditoría con el usuario y el origen
      "Claude".
- [ ] AC-9: Al revocar una conexión, la siguiente llamada de Claude responde "no autorizado".
- [ ] AC-10: Si un administrador desactiva el conector, ninguna conexión de la organización funciona.
- [ ] AC-11: La página de Configuración muestra la dirección, el botón de copiar y las instrucciones,
      en español, en móvil y escritorio, con estados de carga, vacío y error.
- [ ] AC-12: Superar el límite de peticiones responde "demasiadas peticiones" sin tocar datos.

## Open questions (para `clarify`)
- ¿Qué roles pueden conectar Claude? ¿Todos, o el administrador elige?
- ¿Cuánto dura una conexión antes de pedir volver a entrar?
- ¿Por qué secciones empezamos? Propuesta: clientes, casos, tareas, notas, oportunidades y
  cotizaciones primero; luego el resto.
- ¿Dónde está desplegado el CRM (dirección pública)? El conector necesita una dirección HTTPS pública.
