# Sesión TTL y organización activa (JH-005)

**PR:** `cursor/session-ttl-org-4494`  
**Fecha política:** 2026-10-15

## TTL elegido

| Audiencia | Valor | Notas |
|---|---|---|
| Staff (JWT) | **30 días** (`2_592_000` s) | Reemplaza el default previo de ~10 años |
| Portal | Mismo techo JWT (NextAuth `maxAge` global); default documentado 7 días si se separa en el futuro | Revocación inmediata vía `sessionVersion` / `isActive` |

Override: `SESSION_MAX_AGE_SECONDS` en env (entero > 0).

Invalidación operativa (no depende del TTL):

- Staff: `User.sessionVersion` bump o `isActive=false` → JWT vacío en callback
- Portal: `ClientPortalAccess.sessionVersion` / revoke

## Organización activa

`resolveActiveMembership` (`src/server/auth/resolve-active-membership.ts`):

1. `AUTH_DEFAULT_ORGANIZATION_ID` si el usuario es miembro  
2. Única membresía  
3. Mejor rol (OWNER → VIEWER), luego `createdAt` asc, luego `organizationId`  
4. Con `AUTH_ORG_STRICT=true` y varias sin default → `null` (sin tenant)

Usado en login (`auth.ts`) y refresh JWT (`loadAuthTokenState`).

## Pruebas

- Sin DB: `npm run smoke:session-ttl-org` (TEST-004)
- Con DB sandbox: `npm run smoke:mfa-login` / `tsx --env-file=.env.local scripts/smoke/session-version.ts` (revocación)
