"use client";

import { useServerInsertedHTML } from "next/navigation";
import { THEME_INIT_SCRIPT } from "./theme";

/**
 * Inyecta el script anti-FOUC fuera del árbol React (React 19 / Next 16).
 * Evita el warning "Encountered a script tag while rendering React component".
 */
export function ThemeScript() {
  useServerInsertedHTML(() => (
    <script
      id="jh-theme-init"
      dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
    />
  ));
  return null;
}
