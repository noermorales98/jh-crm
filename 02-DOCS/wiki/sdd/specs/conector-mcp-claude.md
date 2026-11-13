---
type: spec
title: Spec — Conector MCP de JH CRM para Claude
description: WHAT and WHY del conector remoto que deja a Claude leer, crear, editar y borrar datos del CRM.
tags: [sdd, spec, mcp, ai, auth, oauth]
timestamp: 2026-11-09T00:00:00Z
topic: sdd
slug: conector-mcp-claude
branch: feat/conector-mcp-claude
status: shipped
approved_by: Noeli, 2026-11-09 ("Sí, la apruebo")
shipped: 2026-11-13, PR #42 merged into main (bd4267d)
---

# Spec — Conector MCP de JH CRM para Claude

> Slug: `conector-mcp-claude` · Status: **approved** · Created: 2026-11-09
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
como solución final y no se construye.

## Goals
- Una persona del equipo conecta Claude (web, escritorio o móvil) al CRM en uno o dos pasos, una vez
  que un administrador ha encendido el conector para la organización (se hace una sola vez).
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
- **Dueña / administrador:** enciende o apaga el conector para la organización, revoca conexiones y
  revisa qué hizo Claude. Cualquier rol puede conectar Claude mientras esté encendido.

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
- La conexión no caduca para la persona, pero la llave interna se renueva sola y cada conexión se
  puede revocar. Nunca se guarda un secreto en claro.
- Límite de peticiones por persona para que un error de Claude no sature el CRM.

## How it proves it
Pruebas en `scripts/smoke/` que fallan sin el cambio y pasan con él.

## Behaviour
- Main path: la persona pega la dirección en Claude → entra con su usuario del CRM y autoriza →
  pide algo a Claude → Claude llama a una herramienta → el CRM comprueba conexión, permiso y datos →
  hace el cambio con las reglas de la app → responde con datos limpios y un enlace.
- Edge cases: conector apagado en la organización; usuario desactivado o con rol cambiado; id de
  otra organización; borrado de algo que la app solo archiva o cancela; muchas llamadas seguidas.
- Error paths: sin conexión o revocada → "No autorizado"; sin permiso → "Sin permiso"; registro
  ajeno o inexistente → "No encontrado"; regla de negocio rota → su mensaje en español; demasiadas
  llamadas → "Demasiadas peticiones". Ningún error devuelve datos ni trazas.

## Acceptance criteria
- [x] AC-1: Sin conexión autorizada, cualquier llamada al conector responde "no autorizado" y no
      devuelve datos.
- [x] AC-2: Una persona conecta Claude en la web con su usuario del CRM; si tiene MFA, se le pide.
- [x] AC-3: Claude solo ve datos de la organización de esa persona. Pedir un id de otra organización
      responde "no encontrado".
- [x] AC-4: Un rol VIEWER puede leer pero cualquier creación, edición o borrado responde "sin permiso".
- [ ] AC-5: Para cada sección del CRM existe al menos lectura; crear, editar y borrar existen donde la
      app los permite, con el mismo permiso.
- [x] AC-6: Ninguna respuesta del conector contiene SSN/ITIN, números de cuenta completos ni secretos.
- [ ] AC-7: Borrar un pago, ronda o contrato vía Claude hace borrado lógico, igual que en la app.
- [x] AC-8: Cada cambio hecho vía Claude aparece en actividad y auditoría con el usuario y el origen
      "Claude".
- [x] AC-9: Al revocar una conexión, la siguiente llamada de Claude responde "no autorizado".
- [x] AC-10: Si un administrador desactiva el conector, ninguna conexión de la organización funciona.
- [x] AC-11: La página de Configuración muestra la dirección, el botón de copiar y las instrucciones,
      en español, en móvil y escritorio, con estados de carga, vacío y error. Con el conector apagado,
      explica que un administrador debe encenderlo (y al administrador le muestra el interruptor).
- [x] AC-12: Superar el límite de peticiones responde "demasiadas peticiones" sin tocar datos.
- [x] AC-13: Cualquier rol (OWNER, ADMIN, SPECIALIST, STAFF, VIEWER) puede conectar Claude.
- [x] AC-14: Una conexión que no se revoca sigue funcionando sin volver a entrar, aunque pasen meses;
      una llave interna robada deja de servir sola en poco tiempo.

## Clarifications (2026-11-09, Noeli)
- **Roles:** todos pueden conectar Claude. Cada uno queda limitado a los permisos de su rol. Un
  administrador puede apagar el conector para toda la organización (AC-10, AC-13).
- **Duración:** la conexión nunca caduca para la persona. Por seguridad, la llave interna es de vida
  corta y se renueva sola. Riesgo aceptado: un dispositivo perdido mantiene el acceso hasta que se
  revoca en "Conexiones activas" (AC-9, AC-14).
- **Alcance por tandas** (cada tanda es un PR propio, con lectura, creación, edición y borrado):
  1. Conexión (OAuth + página de Configuración + revocar) y clientes, casos, tareas, notas,
     oportunidades y cotizaciones.
  2. Rondas, disputas, cartas, reportes de crédito y consultas.
  3. Pagos, recibos, contratos, planes de pago, catálogo, mails y el resto de secciones.
  AC-5 se cumple al cerrar la tanda 3; cada tanda lo cumple para sus secciones.
- **Dirección:** el CRM está en Vercel con el dominio `jh-multiservices.com`. El conector vivirá en
  `<dirección pública del CRM>/api/mcp`, tomada de la configuración del CRM (supuesto: producción es
  `https://www.jh-multiservices.com`; se confirma antes de la prueba con claude.ai).

## Clarifications (2026-11-09, tras `analyze`)
- **Paso previo del administrador:** el conector viene apagado; un administrador lo enciende una vez.
  Hasta entonces la página lo explica (AC-11). Aceptado por la dueña al pedir las correcciones.
- **Cambio de rol o de correo:** cierra las sesiones de esa persona y también corta su conexión con
  Claude; tiene que volver a conectar. Aceptado como efecto de seguridad.

## Assumptions
- Claude escribe con los mismos servicios de `src/server/` que la app. Para leer, reutiliza las
  consultas del asistente interno y añade las que falten, siempre filtrando por organización.
- Los datos que devuelve el conector pasan por la misma limpieza que el asistente interno
  (`sanitizeForAI`).

## Points to clarify
- **suposición tomada** — producción es `https://www.jh-multiservices.com`. *Base:* dominios en el
  repo y proyecto de Vercel. *Riesgo:* si no, la prueba con claude.ai se hace en otra dirección; el
  código no cambia porque usa `NEXT_PUBLIC_APP_URL`.
- **suposición tomada** — claude.ai acepta un servidor OAuth propio con registro dinámico y PKCE.
  *Base:* especificación de autorización de MCP. *Riesgo:* si cambia, se ajusta el servidor OAuth.
- **decisión diferida** — secciones de las tandas 2 y 3 (incluido AC-7). Llegan en PR propios.
- **decisión diferida** — cómo probar con claude.ai en un preview protegido de Vercel. Se decide
  antes de T029.
