"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

/** Posición fixed alineada al ancla, para menús con blur fuera del toolbar. */
export function useOverlayCoords(
  open: boolean,
  anchorRef: RefObject<HTMLElement | null>,
) {
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchorRef]);

  return coords;
}
