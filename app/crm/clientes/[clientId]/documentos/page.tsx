import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as documentService from "@/src/server/documents";
import { isStorageConfigured } from "@/src/lib/storage/s3";
import { DomainError } from "@/src/server/errors";
import { Alert, Card, CardBody, CardHeader } from "@/src/components/ui";
import { DocumentUploader } from "@/src/components/documents/document-uploader";
import { DocumentTable } from "@/src/components/documents/document-table";
import { ClientHeader } from "../client-header";

export const metadata: Metadata = {
  title: "Documentos del cliente",
};

export default async function ClientDocumentsPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireOrganization();

  let detail: Awaited<ReturnType<typeof clientService.getClientDetail>>;
  try {
    detail = await clientService.getClientDetail(ctx, clientId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const { client } = detail;
  const canUpload = can(ctx.role, "documents.upload");
  const storageReady = isStorageConfigured();
  const documents = await documentService.listDocuments(ctx, {
    clientId: client.id,
    limit: 50,
  });

  return (
    <div>
      <ClientHeader client={client} />

      <Card className="overflow-hidden">
        <CardHeader
          title="Documentos"
          description={`${documents.items.length} archivo${documents.items.length === 1 ? "" : "s"} del cliente.`}
        />
        <CardBody className="space-y-3 px-4 py-3">
          {storageReady ? (
            canUpload ? (
              <DocumentUploader clientId={client.id} />
            ) : (
              <Alert tone="info">
                Tu rol es de solo lectura: no puedes subir documentos.
              </Alert>
            )
          ) : (
            <Alert tone="info">
              El almacenamiento no está configurado. Puedes ver la lista, pero
              no subir archivos.
            </Alert>
          )}
        </CardBody>
        <DocumentTable documents={documents.items} canDelete={canUpload} />
      </Card>
    </div>
  );
}
