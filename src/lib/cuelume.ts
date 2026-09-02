import { play } from "cuelume";

/** Sonido de resultado para una acción que acaba de disparar el usuario. */
export function playActionResult(ok: boolean) {
  play(ok ? "success" : "error");
}
