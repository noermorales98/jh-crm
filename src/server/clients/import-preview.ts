import { prisma } from "@/src/lib/db";
import { DomainError } from "@/src/server/errors";
import { nextClientCode } from "@/src/server/folios";
import { writeActivityLog } from "@/src/server/activity";
import type { OrganizationContext } from "@/src/server/auth/guards";
import { toActivityContext } from "@/src/server/context";
import {
  classifyImportRows,
  countImportStatuses,
  normalizeImportEmail,
  parseImportCsv,
  type ClassifiedImportRow,
} from "@/src/server/clients/import-csv";

async function loadExistingEmails(
  organizationId: string,
  emails: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(emails.filter(Boolean))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;

  const existing = await prisma.client.findMany({
    where: {
      organizationId,
      email: { in: unique },
    },
    select: { id: true, email: true },
  });

  for (const row of existing) {
    if (!row.email) continue;
    const key = normalizeImportEmail(row.email);
    if (!map.has(key)) map.set(key, row.id);
  }
  return map;
}

async function classifyCsv(
  ctx: OrganizationContext,
  csvText: string,
): Promise<ClassifiedImportRow[]> {
  const parsed = parseImportCsv(csvText);
  const emails = parsed
    .map((r) => (r.emailRaw ? normalizeImportEmail(r.emailRaw) : ""))
    .filter(Boolean);
  const existingByEmail = await loadExistingEmails(ctx.organizationId, emails);
  return classifyImportRows(parsed, existingByEmail);
}

export type ClientImportPreviewResult = {
  rows: ClassifiedImportRow[];
  counts: ReturnType<typeof countImportStatuses>;
};

/** Dry-run: no escribe en DB. */
export async function previewClientImport(
  ctx: OrganizationContext,
  csvText: string,
): Promise<ClientImportPreviewResult> {
  const rows = await classifyCsv(ctx, csvText);
  return { rows, counts: countImportStatuses(rows) };
}

export type ClientImportCommitResult = {
  created: number;
  counts: ReturnType<typeof countImportStatuses>;
  errors: Array<{ row: number; message: string }>;
  createdClientIds: string[];
};

/** Re-clasifica y crea solo filas `create` en una transacción. */
export async function commitClientImport(
  ctx: OrganizationContext,
  csvText: string,
): Promise<ClientImportCommitResult> {
  const rows = await classifyCsv(ctx, csvText);
  const counts = countImportStatuses(rows);
  const toCreate = rows.filter((r) => r.status === "create");
  const errors: Array<{ row: number; message: string }> = rows
    .filter((r) => r.status === "invalid")
    .map((r) => ({
      row: r.row,
      message: r.message ?? "Fila inválida.",
    }));

  if (toCreate.length === 0) {
    return { created: 0, counts, errors, createdClientIds: [] };
  }

  const createdClientIds: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      for (const row of toCreate) {
        if (!row.email) {
          throw new DomainError(`Fila ${row.row}: correo requerido para crear.`);
        }
        const { code } = await nextClientCode(tx, ctx.organizationId);
        const client = await tx.client.create({
          data: {
            organizationId: ctx.organizationId,
            clientCode: code,
            firstName: row.firstName,
            lastName: row.lastName || null,
            email: row.email,
            status: "LEAD",
          },
        });
        await writeActivityLog(
          toActivityContext(ctx),
          {
            type: "CREATED",
            description: `Cliente ${client.clientCode} importado: ${client.firstName} ${client.lastName ?? ""}`.trim(),
            clientId: client.id,
            metadata: { clientCode: client.clientCode, source: "csv_import" },
          },
          tx,
        );
        createdClientIds.push(client.id);
      }
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      error instanceof Error
        ? `No se pudo completar la importación: ${error.message}`
        : "No se pudo completar la importación.",
    );
  }

  return {
    created: createdClientIds.length,
    counts,
    errors,
    createdClientIds,
  };
}
