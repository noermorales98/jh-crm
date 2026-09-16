import type { Role } from "@prisma/client";

/**
 * Matriz de permisos por rol (Fase 12 de la guía de implementación).
 *
 * VIEWER      — solo lectura.
 * STAFF       — operación diaria; sin datos sensibles.
 * SPECIALIST  — operación + datos sensibles (SSN, documentos confidenciales).
 * ADMIN/OWNER — todo lo anterior + anular recibos, gestionar usuarios,
 *               ver auditoría y administrar catálogo/configuración.
 *
 * No confiar solo en ocultar botones: las acciones llaman a requireRole/can.
 */

export const PERMISSION_ACTIONS = [
  // Lectura general
  "clients.view",
  "cases.view",
  "rounds.view",
  "tasks.view",
  "documents.view",
  "quotes.view",
  "payments.view",
  "receipts.view",
  "catalog.view",
  "dashboard.view",
  "mails.view",
  "creditReports.view",
  "creditItems.view",
  "disputes.view",
  "comparisons.view",
  "letters.view",
  "opportunities.view",
  "processors.view",
  "attribution.view",
  "consultations.view",
  "contracts.view",
  "testimonials.view",
  // Escritura operativa
  "testimonials.manage",
  "clients.create",
  "clients.edit",
  "cases.manage",
  "rounds.manage",
  "tasks.manage",
  "documents.upload",
  "quotes.manage",
  "payments.register",
  "mails.manage",
  "creditReports.manage",
  "creditItems.manage",
  "disputes.manage",
  "comparisons.manage",
  "letters.manage",
  "opportunities.manage",
  "processors.manage",
  "consultations.manage",
  "contracts.manage",
  // Datos sensibles
  "sensitive.view",
  "sensitive.edit",
  "documents.downloadSensitive",
  // Administración
  "testimonials.publish",
  "receipts.void",
  "users.manage",
  "audit.view",
  "catalog.manage",
  "settings.manage",
  "portal.manage",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

const ALL_READ: PermissionAction[] = [
  "testimonials.view",
  "clients.view",
  "cases.view",
  "rounds.view",
  "tasks.view",
  "documents.view",
  "quotes.view",
  "payments.view",
  "receipts.view",
  "catalog.view",
  "dashboard.view",
  "mails.view",
  "creditReports.view",
  "creditItems.view",
  "disputes.view",
  "comparisons.view",
  "letters.view",
  "opportunities.view",
  "processors.view",
  "consultations.view",
  "contracts.view",
];

/** STAFF+ (no VIEWER): atribución / marketing. */
const STAFF_PLUS_READ: PermissionAction[] = ["attribution.view"];

const STAFF_WRITE: PermissionAction[] = [
  "testimonials.manage",
  "clients.create",
  "clients.edit",
  "cases.manage",
  "rounds.manage",
  "tasks.manage",
  "documents.upload",
  "quotes.manage",
  "payments.register",
  "mails.manage",
  "creditReports.manage",
  "creditItems.manage",
  "disputes.manage",
  "comparisons.manage",
  "letters.manage",
  "opportunities.manage",
  "consultations.manage",
  "contracts.manage",
];

const SENSITIVE: PermissionAction[] = [
  "sensitive.view",
  "sensitive.edit",
  "documents.downloadSensitive",
];

/** Catálogo + procesadores + portal: ADMIN/OWNER; SPECIALIST también gestiona procesadores. */
const ADMIN_ONLY: PermissionAction[] = [
  "testimonials.publish",
  "receipts.void",
  "users.manage",
  "audit.view",
  "catalog.manage",
  "settings.manage",
  "processors.manage",
  "portal.manage",
];

const MATRIX: Record<Role, ReadonlySet<PermissionAction>> = {
  OWNER: new Set([
    ...ALL_READ,
    ...STAFF_PLUS_READ,
    ...STAFF_WRITE,
    ...SENSITIVE,
    ...ADMIN_ONLY,
  ]),
  ADMIN: new Set([
    ...ALL_READ,
    ...STAFF_PLUS_READ,
    ...STAFF_WRITE,
    ...SENSITIVE,
    ...ADMIN_ONLY,
  ]),
  SPECIALIST: new Set([
    ...ALL_READ,
    ...STAFF_PLUS_READ,
    ...STAFF_WRITE,
    ...SENSITIVE,
    "processors.manage",
  ]),
  STAFF: new Set([...ALL_READ, ...STAFF_PLUS_READ, ...STAFF_WRITE]),
  VIEWER: new Set(ALL_READ),
};

export function can(
  role: Role | null | undefined,
  action: PermissionAction,
): boolean {
  if (!role) return false;
  return MATRIX[role]?.has(action) ?? false;
}

export function canUser(
  user: { role?: Role | null } | null | undefined,
  action: PermissionAction,
): boolean {
  return can(user?.role, action);
}

export function permissionsForRole(role: Role): PermissionAction[] {
  return [...MATRIX[role]];
}
