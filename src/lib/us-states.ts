/** Estados de EE. UU. (más DC y Puerto Rico). En la BD se guarda el código de 2 letras. */
export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "PR", name: "Puerto Rico" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

export type UsStateCode = (typeof US_STATES)[number]["code"];

const BY_CODE = new Map<string, string>(US_STATES.map((s) => [s.code, s.name]));
const BY_NAME = new Map<string, string>(US_STATES.map((s) => [s.name.toLowerCase(), s.code]));

/** «tx», «Texas» o «TX» → «TX». null si no es un estado conocido. */
export function normalizeStateCode(raw: string | null | undefined): UsStateCode | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const upper = text.toUpperCase();
  if (BY_CODE.has(upper)) return upper as UsStateCode;
  const byName = BY_NAME.get(text.toLowerCase());
  return (byName as UsStateCode | undefined) ?? null;
}

/** «TX» → «Texas». Si no se reconoce, devuelve el texto tal cual (o null). */
export function stateName(raw: string | null | undefined): string | null {
  const code = normalizeStateCode(raw);
  if (code) return BY_CODE.get(code) ?? code;
  const text = (raw ?? "").trim();
  return text || null;
}

/** «Houston, Texas» con lo que haya. */
export function cityStateLabel(city: string | null | undefined, state: string | null | undefined): string | null {
  return [city?.trim() || null, stateName(state)].filter(Boolean).join(", ") || null;
}
