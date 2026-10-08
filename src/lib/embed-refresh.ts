/** Bus ligero para refrescar workspaces embebidos tras mutaciones (router.refresh no alcanza estado client). */

type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeEmbedRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyEmbedRefresh(): void {
  for (const listener of listeners) {
    listener();
  }
}
