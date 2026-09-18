import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as caseService from "@/src/server/cases";
import * as documentService from "@/src/server/documents";
import { isStorageConfigured } from "@/src/lib/storage/s3";
import { DomainError } from "@/src/server/errors";
import { Alert, Card, CardBody, CardHeader, Pill } from "@/src/components/ui";
import { UploadDocumentButton } from "@/src/components/clients/quick-add-document-button";
import { DocumentTable } from "@/src/components/documents/document-table";
import { getCaseDocumentChecklist } from "@/src/server/documents/checklist";
import { DOCUMENT_CATEGORY_LABELS, labelFor } from "@/src/lib/labels";
import { CaseHeader } from "../case-header";

export const metadata: Metadata = {
  title: "Documentos del caso",
};

export default async function CaseDocumentsPage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof caseService.getCaseDetail>>;
  try {
    detail = await caseService.getCaseDetail(ctx, caseId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { case: creditCase } = detail;
  const canUpload = can(ctx.role, "documents.upload");
  const storageReady = isStorageConfigured();

  const [documents, checklist] = await Promise.all([
    documentService.listDocuments(ctx, {
      clientId: creditCase.client.id,
      caseId: creditCase.id,
      limit: 50,
    }),
    getCaseDocumentChecklist(ctx, creditCase.id),
  ]);

  return (
    <div>
      <CaseHeader creditCase={creditCase} />

      <Card>
        <CardHeader
          title="Checklist del servicio"
          description={
            checklist.serviceName
              ? `Documentos requeridos para ${checklist.serviceName}.`
              : "Documentos requeridos para este servicio."
          }
          compact
        />
        <CardBody className="px-4 py-3">
          <ul className="grid gap-2 sm:grid-cols-2">
            {checklist.rows.map((row) => (
              <li
                key={row.category}
                className="flex items-center justify-between gap-3 rounded-control bg-surface-panel px-3 py-2"
              >
                <span className="text-[13px] text-ink">
                  {labelFor(DOCUMENT_CATEGORY_LABELS, row.category)}
                  {row.required ? null : (
                    <span className="ml-1.5 text-[11px] text-text-secondary">
                      opcional
                    </span>
                  )}
                </span>
                {row.present ? (
                  <Pill tone="green">
                    Recibido{row.count > 1 ? ` · ${row.count}` : ""}
                  </Pill>
                ) : (
                  <Pill tone={row.required ? "red" : "slate"}>
                    {row.required ? "Pendiente" : "Sin archivo"}
                  </Pill>
                )}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Documentos del proceso"
          description="Cartas, reportes y adjuntos de este caso."
          compact
        />
        <CardBody className="space-y-3 px-4 py-3">
          {storageReady ? (
            canUpload ? (
              <UploadDocumentButton clientId={creditCase.client.id} caseId={creditCase.id} />
            ) : (
              <Alert tone="info">
                Tu rol es de solo lectura: no puedes subir documentos.
              </Alert>
            )
          ) : (
            <Alert tone="info">
              El almacenamiento de archivos no está configurado en este entorno
              (faltan variables S3). La lista de documentos sigue disponible,
              pero la subida está deshabilitada.
            </Alert>
          )}
        </CardBody>
        <DocumentTable documents={documents.items} canDelete={canUpload} />
      </Card>
    </div>
  );
}
