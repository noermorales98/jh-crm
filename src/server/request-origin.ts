import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Origen de la petición (conector MCP, AC-8). Marca "esto lo hace Claude" para que
 * actividad y auditoría lo registren sin cambiar la firma de cada servicio.
 * Fuera de `runWithRequestOrigin` no hay origen y nada cambia.
 */
export interface RequestOrigin {
  via?: "claude";
  connectionId?: string;
}

const storage = new AsyncLocalStorage<Required<RequestOrigin>>();

export function runWithRequestOrigin<T>(
  origin: Required<RequestOrigin>,
  fn: () => Promise<T>,
): Promise<T> {
  return storage.run({ via: origin.via, connectionId: origin.connectionId }, fn);
}

export function currentRequestOrigin(): RequestOrigin {
  const origin = storage.getStore();
  return origin ? { ...origin } : {};
}

/**
 * Sella el origen en la metadata. Dentro del conector, `via` y `connectionId` salen
 * siempre del origen (la metadata del llamador no los puede pisar). Fuera, se quitan,
 * para que nadie pueda hacerse pasar por Claude. El resto de la metadata no cambia.
 */
export function withRequestOrigin(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const origin = storage.getStore();
  if (origin) return { ...metadata, via: origin.via, connectionId: origin.connectionId };
  if (!metadata || !("via" in metadata || "connectionId" in metadata)) return metadata;
  const rest = { ...metadata };
  delete rest.via;
  delete rest.connectionId;
  return rest;
}
