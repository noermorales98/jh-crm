/** Evento global para abrir el Spotlight desde cualquier UI (p. ej. dashboard). */
export const SPOTLIGHT_OPEN_EVENT = "jh:open-spotlight";

export function openSpotlightSearch() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SPOTLIGHT_OPEN_EVENT));
}
