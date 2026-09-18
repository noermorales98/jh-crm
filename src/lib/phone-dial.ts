/**
 * Códigos de marcación internacional para teléfonos de contacto.
 * Valor = dígitos del código (sin +). USA/CA comparten +1.
 */
export const PHONE_DIAL_OPTIONS = [
  { code: "1", label: "🇺🇸 EE. UU. +1", short: "+1" },
  { code: "52", label: "🇲🇽 México +52", short: "+52" },
  { code: "1-CA", label: "🇨🇦 Canadá +1", short: "+1" },
  { code: "34", label: "🇪🇸 España +34", short: "+34" },
  { code: "57", label: "🇨🇴 Colombia +57", short: "+57" },
  { code: "54", label: "🇦🇷 Argentina +54", short: "+54" },
  { code: "56", label: "🇨🇱 Chile +56", short: "+56" },
  { code: "51", label: "🇵🇪 Perú +51", short: "+51" },
  { code: "58", label: "🇻🇪 Venezuela +58", short: "+58" },
  { code: "506", label: "🇨🇷 Costa Rica +506", short: "+506" },
  { code: "503", label: "🇸🇻 El Salvador +503", short: "+503" },
  { code: "502", label: "🇬🇹 Guatemala +502", short: "+502" },
  { code: "504", label: "🇭🇳 Honduras +504", short: "+504" },
  { code: "505", label: "🇳🇮 Nicaragua +505", short: "+505" },
  { code: "507", label: "🇵🇦 Panamá +507", short: "+507" },
  { code: "593", label: "🇪🇨 Ecuador +593", short: "+593" },
  { code: "595", label: "🇵🇾 Paraguay +595", short: "+595" },
  { code: "598", label: "🇺🇾 Uruguay +598", short: "+598" },
  { code: "44", label: "🇬🇧 Reino Unido +44", short: "+44" },
] as const;

export const DEFAULT_PHONE_DIAL_CODE = "1";

/** Normaliza el value del select a dígitos de lada (Canadá → 1). */
export function dialDigitsFromOption(code: string): string {
  if (code === "1-CA") return "1";
  return code.replace(/\D/g, "");
}

/** Une lada + número nacional en formato E.164 simple (+código…dígitos). */
export function composeInternationalPhone(
  dialCode: string,
  nationalNumber: string,
): string {
  const dial = dialDigitsFromOption(dialCode);
  const national = nationalNumber.replace(/\D/g, "");
  if (!dial || !national) return national ? `+${national}` : "";
  return `+${dial}${national}`;
}

/** Valida número nacional (solo dígitos/espacios/guiones; 7–15 dígitos). */
export function isValidNationalPhone(nationalNumber: string): boolean {
  const digits = nationalNumber.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}
