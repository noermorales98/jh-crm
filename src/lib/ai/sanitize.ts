/**
 * AI-002 — sanitizeForAI()
 *
 * Política (docs/13-OPENROUTER_AI.md §Sanitización): antes de enviar datos a
 * OpenRouter se eliminan, salvo necesidad explícita:
 *
 * - SSN / ITIN (completos, últimos 4, cifrados o enmascarados);
 * - identificadores completos (licencias, cuentas);
 * - DOB;
 * - dirección postal;
 * - números de cuenta;
 * - cualquier campo cifrado (*Encrypted).
 *
 * Se conservan: nombres, códigos/folios, email/teléfono de contacto (el
 * asistente es una herramienta interna del staff y los necesita para ser
 * útil), importes y estados operativos.
 *
 * Dos capas:
 * 1. `sanitizeForAI(value)` — recorrido profundo de resultados de tools:
 *    elimina claves sensibles y enmascara patrones de SSN en strings.
 * 2. `sanitizeTextForAI(text)` — texto libre (mensajes del usuario, cuerpos
 *    de correo, notas): enmascara patrones 123-45-6789 y 9 dígitos seguidos.
 */

const MASK = "***-**-****";

/** 123-45-6789 (formato SSN/ITIN). */
const SSN_DASHED = /\b\d{3}-\d{2}-\d{4}\b/g;
/** 9 dígitos seguidos sin separadores. */
const SSN_BARE = /\b\d{9}\b/g;

/**
 * Claves eliminadas de cualquier objeto (comparación en minúsculas).
 * `state` NO se elimina: es el estado operativo del caso (CaseState), no el
 * estado/provincia de una dirección. Tampoco `city` de catálogos: solo se
 * quita en perfiles de persona, ver nota en sanitizeForAI.
 */
const SENSITIVE_KEYS = new Set([
  // SSN / ITIN
  "ssn",
  "ssnlast4",
  "ssnencrypted",
  "ssnmasked",
  "itin",
  "itinlast4",
  "itinencrypted",
  "itinmasked",
  // DOB
  "dateofbirth",
  "dob",
  "birthdate",
  // Dirección
  "address",
  "addressline1",
  "addressline2",
  "street",
  "streetaddress",
  "postalcode",
  "zip",
  "zipcode",
  // Cuentas / identificadores
  "accountnumber",
  "accountreference",
  "routingnumber",
  "cardnumber",
  "cardlast4",
  "bankaccount",
  "driverslicensenumber",
  "licensenumber",
  "passportnumber",
  // Notas sensibles
  "sensitivenotes",
]);

/** Claves de dirección que solo se eliminan dentro de datos de persona. */
const PERSON_ADDRESS_KEYS = new Set(["city"]);

/** Contexto: estamos dentro de un objeto de persona/cliente. */
const PERSON_HINT_KEYS = new Set([
  "firstname",
  "lastname",
  "clientcode",
  "dateofbirth",
  "ssnlast4",
]);

function isSensitiveKey(key: string, insidePerson: boolean): boolean {
  const normalized = key.toLowerCase();
  if (normalized.endsWith("encrypted")) return true;
  if (SENSITIVE_KEYS.has(normalized)) return true;
  if (insidePerson && PERSON_ADDRESS_KEYS.has(normalized)) return true;
  return false;
}

export function sanitizeTextForAI(text: string): string {
  return text.replace(SSN_DASHED, MASK).replace(SSN_BARE, MASK);
}

function looksLikePerson(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) =>
    PERSON_HINT_KEYS.has(key.toLowerCase()),
  );
}

function walk(value: unknown, insidePerson: boolean): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return sanitizeTextForAI(value);
  if (typeof value !== "object") return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, insidePerson));
  }
  // Objetos no planos (Decimal de Prisma, ObjectId, etc.): no tienen claves
  // sensibles enumerables; devolverlos intactos evita destruirlos.
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const source = value as Record<string, unknown>;
  const personHere = insidePerson || looksLikePerson(source);
  const out: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    if (isSensitiveKey(key, personHere)) continue;
    out[key] = walk(nested, personHere);
  }
  return out;
}

/**
 * Sanitiza el resultado de una tool/consulta antes de entregarlo al modelo.
 * No muta el argumento.
 */
export function sanitizeForAI<T>(value: T): T {
  return walk(value, false) as T;
}
