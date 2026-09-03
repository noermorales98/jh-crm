export const THEME_STORAGE_KEY = "jh-theme";

export type ThemePreference = "light" | "dark" | "auto";

export const THEME_OPTIONS: readonly {
  value: ThemePreference;
  label: string;
}[] = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Oscuro" },
  { value: "auto", label: "Auto" },
];

export function isThemePreference(value: string | null): value is ThemePreference {
  return value === "light" || value === "dark" || value === "auto";
}

export function applyTheme(theme: ThemePreference) {
  document.documentElement.dataset.theme = theme;
}

export function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : "auto";
  } catch {
    return "auto";
  }
}

export function persistTheme(theme: ThemePreference) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // modo privado / cuota
  }
}

/** Evita un flash de tema incorrecto antes de hidratar. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");document.documentElement.dataset.theme=(t==="light"||t==="dark"||t==="auto")?t:"auto";}catch(e){}})();`;
