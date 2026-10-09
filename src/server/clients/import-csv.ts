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

export function parseCsvRows(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cells.push(current.trim());
    return cells;
  });
}

/** Parsea CSV a filas tipadas (sin consultar DB). */
export function parseImportCsv(csvText: string): ParsedImportRow[] {
  assertLooksLikeCsvText(csvText);
  const rows = parseCsvRows(csvText);
  if (rows.length === 0) {
    throw new DomainError("El CSV está vacío.");
  }

  const header = rows[0].map((h) => h.toLowerCase());
  const hasHeader =
    header.includes("email") ||
    header.includes("name") ||
    header.includes("firstname") ||
    header.includes("first_name");
  const dataRows = hasHeader ? rows.slice(1) : rows;

  if (dataRows.length > MAX_CLIENT_IMPORT_ROWS) {
    throw new DomainError(
      `El CSV supera el límite de ${MAX_CLIENT_IMPORT_ROWS} filas.`,
    );
  }

  const col = (names: string[]) =>
    names.map((n) => header.indexOf(n)).find((i) => i >= 0);

  const nameIdx = hasHeader
    ? (col(["name", "nombre", "full_name", "fullname"]) ?? -1)
    : 0;
  const firstIdx = hasHeader
    ? (col(["firstname", "first_name", "first", "nombre"]) ?? -1)
    : -1;
  const lastIdx = hasHeader
    ? (col(["lastname", "last_name", "last", "apellido"]) ?? -1)
    : -1;
  const emailIdx = hasHeader
    ? (col(["email", "correo", "mail"]) ?? -1)
    : 1;

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
