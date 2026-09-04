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
  // Escritura operativa
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
  // Datos sensibles
  "sensitive.view",
  "sensitive.edit",
  "documents.downloadSensitive",
  // Administración
  "receipts.void",
  "users.manage",
  "audit.view",
  "catalog.manage",
  "settings.manage",
] as const;

export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

const ALL_READ: PermissionAction[] = [
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
];

const STAFF_WRITE: PermissionAction[] = [
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
];

const SENSITIVE: PermissionAction[] = [
  "sensitive.view",
  "sensitive.edit",
  "documents.downloadSensitive",
];

const ADMIN_ONLY: PermissionAction[] = [
  "receipts.void",
  "users.manage",
  "audit.view",
  "catalog.manage",
  "settings.manage",
];

const MATRIX: Record<Role, ReadonlySet<PermissionAction>> = {
  OWNER: new Set([...ALL_READ, ...STAFF_WRITE, ...SENSITIVE, ...ADMIN_ONLY]),
  ADMIN: new Set([...ALL_READ, ...STAFF_WRITE, ...SENSITIVE, ...ADMIN_ONLY]),
  SPECIALIST: new Set([...ALL_READ, ...STAFF_WRITE, ...SENSITIVE]),
  STAFF: new Set([...ALL_READ, ...STAFF_WRITE]),
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
