import { z } from "zod";
import { clientCreateSchema } from "@/src/lib/validation";
import { DomainError } from "@/src/server/errors";

/** Máximo de filas de datos (sin header) por importación. */
export const MAX_CLIENT_IMPORT_ROWS = 500;

export type ImportRowStatus =
  | "create"
  | "exists"
  | "no_email"
  | "invalid"
  | "duplicate_in_file";

export type ParsedImportRow = {
  row: number;
  firstName: string;
  lastName: string;
  emailRaw: string;
};

export type ClassifiedImportRow = {
  row: number;
  status: ImportRowStatus;
  firstName: string;
  lastName: string;
  email: string | null;
  existingClientId?: string;
  message?: string;
};

export function normalizeImportEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function assertImportFileMeta(
  fileName: string,
  mimeType?: string | null,
): void {
  const name = fileName.trim().toLowerCase();
  const mime = (mimeType ?? "").trim().toLowerCase();
  if (
    name.endsWith(".xlsx") ||
    name.endsWith(".xls") ||
    mime.includes("spreadsheet") ||
    mime.includes("excel")
  ) {
    throw new DomainError(
      "Solo se admiten archivos CSV. El formato Excel no está soportado todavía.",
    );
  }
  if (name.includes(".") && !name.endsWith(".csv")) {
    throw new DomainError("Solo se admiten archivos CSV.");
  }
}

/** Rechaza payloads que parecen XLSX (ZIP) u otros binarios. */
export function assertLooksLikeCsvText(text: string): void {
  if (!text.trim()) {
    throw new DomainError("El CSV está vacío.");
  }
  if (text.charCodeAt(0) === 0x50 && text.charCodeAt(1) === 0x4b) {
    throw new DomainError(
      "Solo se admiten archivos CSV. El formato Excel no está soportado todavía.",
    );
  }
}

/** Normaliza cabeceras: minúsculas, sin acentos, espacios→_ . */
export function normalizeHeaderCell(raw: string): string {
  return raw
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[\s\-]+/g, "_");
}

/**
 * Parser CSV RFC4180-ish: comillas, `""` escapado, saltos de línea dentro
 * de campos entrecomillados. No descarta filas vacías entre comillas.
 */
export function parseCsvRows(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          current += '"';
          i += 1;
          continue;
        }
        inQuotes = false;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(current.trim());
      current = "";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    if (ch === "\n") {
      row.push(current.trim());
      current = "";
      // Conserva filas con contenido; omite líneas totalmente vacías fuera de quotes.
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    current += ch;
  }

  row.push(current.trim());
  if (inQuotes) {
    throw new DomainError("CSV con comillas sin cerrar.");
  }
  if (row.some((c) => c.length > 0) || rows.length === 0) {
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

const EMAIL_ALIASES = [
  "email",
  "correo",
  "correo_electronico",
  "e_mail",
  "mail",
];
const FIRST_ALIASES = [
  "firstname",
  "first_name",
  "first",
  "nombre",
  "nombres",
];
const LAST_ALIASES = [
  "lastname",
  "last_name",
  "last",
  "apellido",
  "apellidos",
];
const FULL_NAME_ALIASES = [
  "name",
  "nombre_completo",
  "full_name",
  "fullname",
  "cliente",
];

/** Parsea CSV a filas tipadas (sin consultar DB). */
export function parseImportCsv(csvText: string): ParsedImportRow[] {
  assertLooksLikeCsvText(csvText);
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    throw new DomainError("El CSV está vacío.");
  }

  const header = rows[0].map((h) => normalizeHeaderCell(h));
  const hasHeader =
    EMAIL_ALIASES.some((a) => header.includes(a)) ||
    FIRST_ALIASES.some((a) => header.includes(a)) ||
    FULL_NAME_ALIASES.some((a) => header.includes(a)) ||
    header.includes("first_name");
  const dataRows = hasHeader ? rows.slice(1) : rows;

  if (dataRows.length > MAX_CLIENT_IMPORT_ROWS) {
    throw new DomainError(
      `El CSV supera el límite de ${MAX_CLIENT_IMPORT_ROWS} filas.`,
    );
  }

  const col = (names: string[]) =>
    names.map((n) => header.indexOf(n)).find((i) => i !== undefined && i >= 0);

  const nameIdx = hasHeader ? (col(FULL_NAME_ALIASES) ?? -1) : 0;
  const firstIdx = hasHeader ? (col(FIRST_ALIASES) ?? -1) : -1;
  const lastIdx = hasHeader ? (col(LAST_ALIASES) ?? -1) : -1;
  const emailIdx = hasHeader ? (col(EMAIL_ALIASES) ?? -1) : 1;

  return dataRows.map((row, i) => {
    const rowNum = i + (hasHeader ? 2 : 1);
    let firstName = "";
    let lastName = "";
    if (firstIdx >= 0) {
      firstName = row[firstIdx] ?? "";
      lastName = lastIdx >= 0 ? (row[lastIdx] ?? "") : "";
    } else if (nameIdx >= 0) {
      const parts = (row[nameIdx] ?? "").trim().split(/\s+/);
      firstName = parts[0] ?? "";
      lastName = parts.slice(1).join(" ");
    } else {
      firstName = row[0] ?? "";
    }
    const emailRaw =
      emailIdx >= 0 ? (row[emailIdx] ?? "").trim() : (row[1] ?? "").trim();
    return { row: rowNum, firstName, lastName, emailRaw };
  });
}

export function classifyImportRows(
  parsed: ParsedImportRow[],
  existingByEmail: Map<string, string>,
): ClassifiedImportRow[] {
  const seenInFile = new Set<string>();
  const out: ClassifiedImportRow[] = [];

  for (const row of parsed) {
    const emailNorm = row.emailRaw ? normalizeImportEmail(row.emailRaw) : "";
    if (!emailNorm) {
      out.push({
        row: row.row,
        status: "no_email",
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        email: null,
        message: "Sin correo: no se crea.",
      });
      continue;
    }

    try {
      const data = clientCreateSchema.parse({
        firstName: row.firstName,
        lastName: row.lastName || undefined,
        email: emailNorm,
      });
      const email = normalizeImportEmail(data.email || emailNorm);

      if (seenInFile.has(email)) {
        out.push({
          row: row.row,
          status: "duplicate_in_file",
          firstName: data.firstName,
          lastName: (data.lastName as string) || "",
          email,
          message: "Correo repetido en el archivo.",
        });
        continue;
      }

      const existingId = existingByEmail.get(email);
      if (existingId) {
        seenInFile.add(email);
        out.push({
          row: row.row,
          status: "exists",
          firstName: data.firstName,
          lastName: (data.lastName as string) || "",
          email,
          existingClientId: existingId,
          message: "Ya existe en la organización.",
        });
        continue;
      }

      seenInFile.add(email);
      out.push({
        row: row.row,
        status: "create",
        firstName: data.firstName,
        lastName: (data.lastName as string) || "",
        email,
      });
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? error.issues[0]?.message ?? "Fila inválida."
          : error instanceof Error
            ? error.message
            : "Fila inválida.";
      out.push({
        row: row.row,
        status: "invalid",
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        email: emailNorm,
        message,
      });
    }
  }

  return out;
}

export function countImportStatuses(rows: ClassifiedImportRow[]) {
  const counts = {
    create: 0,
    exists: 0,
    no_email: 0,
    invalid: 0,
    duplicate_in_file: 0,
  };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}

/**
 * JH-004 — si el email ya existe en org (re-check concurrente), no crear.
 * Ver docs/CLIENT_DEDUPE_POLICY.md.
 */
export function shouldSkipCreateForExistingEmail(
  email: string | null | undefined,
  existingByEmail: Map<string, string>,
): { skip: true; existingClientId: string } | { skip: false } {
  if (!email) return { skip: false };
  const key = normalizeImportEmail(email);
  const existingClientId = existingByEmail.get(key);
  if (existingClientId) return { skip: true, existingClientId };
  return { skip: false };
}
