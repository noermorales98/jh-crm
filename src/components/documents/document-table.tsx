import { Download, FileText } from "lucide-react";
import {
  EmptyState,
  Pill,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import {
  DOCUMENT_CATEGORY_LABELS,
  labelFor,
} from "@/src/lib/labels";
import { formatFileSize } from "@/src/server/page-helpers";
import { DocumentDeleteButton } from "./document-delete-button";

export interface DocumentRow {
  id: string;
  category: string;
  sensitivity: string;
  originalName: string;
  displayName: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}

/**
 * Tabla de documentos (server component). La descarga usa el route handler
 * /api/files/[id]/download (valida sesión, audita y redirige a URL firmada).
 * canDelete decide si mostrar el botón de borrado (documents.upload).
 */
export function DocumentTable({
  documents,
  canDelete,
}: {
  documents: DocumentRow[];
  canDelete: boolean;
}) {
  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Sin documentos"
        description="Sube identificaciones, comprobantes o reportes del cliente."
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Nombre</TH>
          <TH>Categoría</TH>
          <TH>Sensibilidad</TH>
          <TH>Tamaño</TH>
          <TH>Subido</TH>
          <TH className="text-right">Acciones</TH>
        </TR>
      </THead>
      <TBody>
        {documents.map((doc) => (
          <TR key={doc.id}>
            <TD className="max-w-64">
              <span className="block truncate font-medium text-ink">
                {doc.displayName ?? doc.originalName}
              </span>
              {doc.displayName ? (
                <span className="block truncate text-xs text-text-secondary">
                  {doc.originalName}
                </span>
              ) : null}
            </TD>
            <TD>{labelFor(DOCUMENT_CATEGORY_LABELS, doc.category)}</TD>
            <TD>
              <Pill
                tone={
                  doc.sensitivity === "HIGHLY_SENSITIVE"
                    ? "red"
                    : doc.sensitivity === "CONFIDENTIAL"
                      ? "amber"
                      : "slate"
                }
              >
                {doc.sensitivity === "HIGHLY_SENSITIVE"
                  ? "Alta"
                  : doc.sensitivity === "CONFIDENTIAL"
                    ? "Confidencial"
                    : "Interno"}
              </Pill>
            </TD>
            <TD className="whitespace-nowrap">{formatFileSize(doc.sizeBytes)}</TD>
            <TD className="whitespace-nowrap">{formatDate(doc.createdAt)}</TD>
            <TD className="text-right">
              <div className="flex items-center justify-end gap-2">
                <a
                  href={`/api/files/${doc.id}/download`}
                  className="inline-flex items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-action-primary transition-colors hover:bg-nav-hover"
                >
                  <Download className="size-3.5" aria-hidden />
                  Descargar
                </a>
                {canDelete ? <DocumentDeleteButton documentId={doc.id} /> : null}
              </div>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
