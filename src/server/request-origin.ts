/**
 * Origen de la petición (conector MCP, AC-8). Marca "esto lo hace Claude" para que
 * actividad y auditoría lo registren sin cambiar la firma de cada servicio.
 * Fuera de `runWithRequestOrigin` no hay origen y nada cambia.
 *
 * `AsyncLocalStorage` se carga al ejecutarse en el servidor (process.getBuiltinModule,
 * Node ≥ 22.3) y no con un import estático: algunos componentes de cliente importan,
 * de forma transitiva, módulos que llegan aquí, y el bundle del navegador no admite
 * `node:async_hooks`. En el navegador nunca hay origen.
 */
export interface RequestOrigin {
  via?: "claude";
  connectionId?: string;
}

type Origin = Required<RequestOrigin>;

interface OriginStorage {
  run<R>(store: Origin, fn: () => R): R;
  getStore(): Origin | undefined;
}

const noStorage: OriginStorage = {
  run: (_store, fn) => fn(),
  getStore: () => undefined,
};

let storage: OriginStorage | null = null;

function originStorage(): OriginStorage {
  if (storage) return storage;
  const getBuiltin = (
    globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }
  ).process?.getBuiltinModule;
  const mod = getBuiltin?.("node:async_hooks") as
    | { AsyncLocalStorage: new () => OriginStorage }
    | undefined;
  storage = mod ? new mod.AsyncLocalStorage() : noStorage;
  return storage;
}

export function runWithRequestOrigin<T>(origin: Origin, fn: () => Promise<T>): Promise<T> {
  return originStorage().run({ via: origin.via, connectionId: origin.connectionId }, fn);
}

export function currentRequestOrigin(): RequestOrigin {
  const origin = originStorage().getStore();
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
  const origin = originStorage().getStore();
  if (origin) return { ...metadata, via: origin.via, connectionId: origin.connectionId };
  if (!metadata || !("via" in metadata || "connectionId" in metadata)) return metadata;
  const rest = { ...metadata };
  delete rest.via;
  delete rest.connectionId;
  return rest;
}
