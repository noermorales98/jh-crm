import { Download, FileText, Image as ImageIcon } from "lucide-react";
import { Pill } from "@/src/components/ui";
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

function sensitivityTone(value: string) {
  if (value === "HIGHLY_SENSITIVE") return "red" as const;
  if (value === "CONFIDENTIAL") return "amber" as const;
  return "slate" as const;
}

function sensitivityLabel(value: string) {
  if (value === "HIGHLY_SENSITIVE") return "Alta";
  if (value === "CONFIDENTIAL") return "Confidencial";
  return "Interno";
}

/**
 * Lista compacta de documentos. La descarga usa /api/files/[id]/download.
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
    return null;
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {documents.map((doc) => {
        const name = doc.displayName ?? doc.originalName;
        const isImage = doc.mimeType.startsWith("image/");
        const Icon = isImage ? ImageIcon : FileText;
        return (
          <li key={doc.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-control bg-surface-app text-action-primary">
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink" title={name}>
                {name}
              </p>
              <p className="truncate text-xs text-text-secondary">
                {labelFor(DOCUMENT_CATEGORY_LABELS, doc.category)}
                {" · "}
                {formatFileSize(doc.sizeBytes)}
                {" · "}
                {formatDate(doc.createdAt)}
              </p>
            </div>
            <Pill tone={sensitivityTone(doc.sensitivity)}>
              {sensitivityLabel(doc.sensitivity)}
            </Pill>
            <div className="flex shrink-0 items-center">
              <a
                href={`/api/files/${doc.id}/download`}
                title="Descargar"
                aria-label={`Descargar ${name}`}
                className="inline-flex size-8 items-center justify-center rounded-control text-action-primary transition-colors hover:bg-nav-hover"
              >
                <Download className="size-4" aria-hidden />
              </a>
              {canDelete ? <DocumentDeleteButton documentId={doc.id} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
