import type { Metadata } from "next";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/src/components/ui";
import { requirePortalSession } from "@/src/server/auth/guards";
import * as portal from "@/src/server/portal";
import { formatDate } from "@/src/lib/format";
import { DOCUMENT_CATEGORY_LABELS, labelFor } from "@/src/lib/labels";
import { formatFileSize } from "@/src/server/page-helpers";
import { FolderOpen } from "lucide-react";
import { PortalDocumentUploader } from "@/src/components/portal/portal-document-uploader";
import { PortalDownloadLink } from "@/src/components/portal/portal-download-link";

export const metadata: Metadata = { title: "Documentos" };

export default async function PortalDocumentosPage() {
  const ctx = await requirePortalSession();
  const documents = await portal.listPortalDocuments(
    ctx.clientId,
    ctx.organizationId,
  );

  return (
    <div>
      <PageHeader
        title="Documentos"
        description="Sube identificación, comprobantes y reportes. No se muestran documentos de SSN ni altamente sensibles."
      />

      <Card className="mb-4">
        <CardHeader title="Subir documento" />
        <CardBody>
          <PortalDocumentUploader />
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Tus archivos" />
        <CardBody>
          {documents.length === 0 ? (
            <EmptyState
              icon={FolderOpen}
              title="Sin documentos"
              description="Cuando subas archivos o tu asesor los cargue, aparecerán aquí."
            />
          ) : (
            <ul className="divide-y divide-border-subtle">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">
                      {doc.displayName ?? doc.originalName}
                    </p>
                    <p className="text-xs text-text-secondary">
                      {labelFor(DOCUMENT_CATEGORY_LABELS, doc.category)}
                      {" · "}
                      {formatFileSize(doc.sizeBytes)}
                      {" · "}
                      {formatDate(doc.createdAt)}
                    </p>
                  </div>
                  <PortalDownloadLink documentId={doc.id} label="Descargar" />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
