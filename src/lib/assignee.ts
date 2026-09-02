/** Si hay un solo miembro activo, ese es el responsable por defecto. */

export function soleId<T extends { id: string }>(items: T[]): string | null {
  return items.length === 1 ? items[0].id : null;
}

export function defaultAssigneeId(members: { id: string }[]): string {
  return soleId(members) ?? "";
}

export function resolveAssigneeId(
  explicit: string | null | undefined,
  soleUserId: string | null,
): string | null {
  const chosen = explicit?.trim() || null;
  return chosen ?? soleUserId;
}
