import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as caseService from "@/src/server/cases";
import * as documentService from "@/src/server/documents";
import { isStorageConfigured } from "@/src/lib/storage/s3";
import { DomainError } from "@/src/server/errors";
import { Alert, Card, CardBody, CardHeader } from "@/src/components/ui";
import { DocumentUploader } from "@/src/components/documents/document-uploader";
import { DocumentTable } from "@/src/components/documents/document-table";
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

  const documents = await documentService.listDocuments(ctx, {
    clientId: creditCase.client.id,
    caseId: creditCase.id,
    limit: 50,
  });

  return (
    <div>
      <CaseHeader creditCase={creditCase} />

      <Card>
        <CardHeader
          title="Documentos del proceso"
          description="Cartas, reportes y adjuntos de este caso."
          compact
        />
        <CardBody className="space-y-3 px-4 py-3">
          {storageReady ? (
            canUpload ? (
              <DocumentUploader clientId={creditCase.client.id} caseId={creditCase.id} />
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
