import type { OrganizationContext } from "@/src/server/auth/guards";
import * as userService from "@/src/server/users";

/**
 * Helpers de presentación para Server Components de página.
 */

/** Opciones {id, name} de miembros ACTIVOS para selects/filtros. */
export async function listMemberOptions(ctx: OrganizationContext) {
  const members = await userService.listMembers(ctx);
  return members
    .filter((m) => m.user.isActive)
    .map((m) => ({
      id: m.user.id,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
    }));
}

export type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Primer valor de un param de query (o undefined). */
export function firstParam(
  sp: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = sp[key];
  if (Array.isArray(value)) return value[0];
  return value;
}

/** Valida un param contra una lista de valores permitidos. */
export function parseEnumParam<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

/** Parsea un param de fecha (yyyy-MM-dd o ISO). undefined si inválido. */
export function parseDateParam(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Date → "yyyy-MM-dd" para inputs type="date". */
export function toDateInputValue(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

/** Nombre completo de un cliente (firstName + lastName). */
export function clientFullName(client: {
  firstName: string;
  lastName?: string | null;
}): string {
  return [client.firstName, client.lastName].filter(Boolean).join(" ");
}

/** Tamaño de archivo legible (KB/MB). */
export function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}
