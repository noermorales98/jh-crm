---
type: constitution
title: jh-crm — Constitution
description: The non-negotiable principles every rsc-sdd phase obeys.
tags: [sdd, constitution]
timestamp: 2026-11-05T22:00:00Z
topic: sdd
status: proposed
version: v1.0.0
---

# jh-crm — Constitution

> Version: v1.0.0 · Ratified: _pendiente_ · Last amended: 2026-11-05
> Las normas de la casa. Si un cambio rompe una, está mal aunque funcione.
> El detalle vive en `docs/` y en el código; aquí se ratifica la norma y se enlaza.
> Objetivo del producto: JH CRM convierte un reporte de crédito de tres burós en decisiones
> claras: qué perjudica al cliente, qué disputar, qué pagar primero y cómo vender el servicio
> con honestidad.

## 1. Stack canon

1. TypeScript en Node 22, con `strict: true` (`tsconfig.json`). Next.js 16 App Router y React 19.
   Leer `node_modules/next/dist/docs/` antes de usar una API de Next (ver `AGENTS.md`).
2. Fijos: Prisma + MySQL, Auth.js v5, Stripe, Tailwind 4. Cambiar uno es una enmienda MAJOR.
3. Gestor de paquetes: npm. Un solo `package-lock.json`, en git.

## 2. Quality bar

4. `npm run lint` y `npm run typecheck` pasan sin errores antes de llegar a main. Lo comprueba el
   CI (`.github/workflows/qa.yml`).
5. Todo cambio de comportamiento trae una prueba en `scripts/smoke/` que falla sin el cambio y
   pasa con él. Nunca se debilita una prueba para que pase.
6. Las pruebas que usan base de datos corren en el CI de GitHub, contra una MySQL desechable.
   Hasta que el CI lo soporte, se ejecutan a mano y su salida se pega en el PR.
7. Nada se marca como hecho sin evidencia observada (salida de la prueba, captura, enlace).

## 3. Conventions

8. Las reglas de dominio de `docs/02-BUSINESS_RULES.md` y la lista por entidad de
   `docs/06-DEFINITION_OF_DONE.md` son obligatorias.
9. El servidor deriva la organización y los permisos. Toda consulta filtra por `organizationId`
   y comprueba que el cliente, caso o documento pertenece a esa organización.
10. El código determinista calcula y evalúa; la IA solo extrae o redacta. Desconocido no es cero
    ni aprobado. No se prometen puntos FICO, montos genéricos ni aprobaciones.
11. Mensajes de commit: un gitmoji y una frase en inglés en imperativo
    (`🐛 Fix the payment link for case quotes`). Lo vigila `gitmoji-guard`.

## 4. Branching & shipping

12. Los cambios normales pueden ir directos a `main` si cumplen 4 y 5.
13. **Áreas delicadas:** pagos, inicio de sesión y MFA, contratos, y el esquema o las migraciones
    de la base de datos. Siempre van en un PR, con ficha enlazada, revisión de tres revisores
    (lógica, seguridad, pruebas) y el sí explícito de la dueña antes de unir. Lo vigilan
    `rsc risk` (nivel 2) y `.rsc/sello-config.json`.
14. **La autoría de git es humana.** Ningún `Co-Authored-By` de una IA ni pie "Generated with" en
    commits o PRs. Lo vigilan `attribution` en `.claude/settings.json` y la fase `ship`.

## 5. Security & privacy floor

15. Ningún secreto entra en git. Los secretos viven en `.env.local` o `01-TOOLS/<provider>/.env`,
    ignorados por git. El CI usa valores de relleno.
16. Los datos personales (SSN/ITIN, reportes, contratos, datos financieros) nunca aparecen en logs,
    prompts, fixtures, URLs ni evidencias. `docs/07-SECURITY.md` es obligatorio.
17. Lo ya cobrado siempre se registra. Pagos, rondas, contratos, actividad y auditoría solo se
    borran de forma lógica (soft delete).
18. Las migraciones son aditivas: ensayadas, repetibles sin daño, recuperables y tras un flag antes
    de activarse. En producción nunca se resetea la base ni se hace una migración destructiva.

## 6. UX floor

19. La interfaz está en español. Cada pantalla resuelve carga, vacío y error, y funciona en móvil.

## 7. Knowledge & decisions

20. Toda decisión importante se apunta en `02-DOCS/wiki/sdd/decisions.md` (fecha, opciones, por
    qué). Esta constitución es la decisión de mayor rango.

## Definition of Done (lo que `verify` comprueba antes de unir)

- [ ] Lint y tipos sin errores (4).
- [ ] Prueba nueva que falla sin el cambio y pasa con él; pruebas con BD ejecutadas (5, 6).
- [ ] Evidencia escrita en el PR o en la ficha (7).
- [ ] Reglas de dominio y lista de la entidad cumplidas (8, 10).
- [ ] Filtro de organización y pertenencia comprobados (9).
- [ ] Commit con gitmoji y autoría humana (11, 14).
- [ ] Si toca un área delicada: PR, ficha, tres revisores y sí de la dueña (13).
- [ ] Sin secretos ni datos personales expuestos; migración aditiva (15, 16, 18).
- [ ] Carga, vacío, error y móvil resueltos (19).
- [ ] Decisiones apuntadas (20).

## Amendment log (append-only)

| Date | Version | Change | Why |
|------|---------|--------|-----|
| 2026-11-05 | v1.0.0 | Propuesta inicial. Pendiente de ratificar. | Instalación de rsc; decisiones de la dueña sobre commits, áreas delicadas, pruebas con BD y autoría. |
