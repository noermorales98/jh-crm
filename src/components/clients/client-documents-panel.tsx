import { Alert, Card, CardBody, CardHeader } from "@/src/components/ui";
import { UploadDocumentButton } from "@/src/components/clients/quick-add-document-button";
import { DocumentTable } from "@/src/components/documents/document-table";

export function ClientDocumentsPanel({
  clientId,
  documents,
  canUpload,
  storageReady,
}: {
  clientId: string;
  documents: Parameters<typeof DocumentTable>[0]["documents"];
  canUpload: boolean;
  storageReady: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Documentos"
        description={`${documents.length} archivo${documents.length === 1 ? "" : "s"} del cliente.`}
      />
      <CardBody className="space-y-3 px-4 py-3">
        {storageReady ? (
          canUpload ? (
            <UploadDocumentButton clientId={clientId} />
          ) : (
            <Alert tone="info">
              Tu rol es de solo lectura: no puedes subir documentos.
            </Alert>
          )
        ) : (
          <Alert tone="info">
            El almacenamiento no está configurado. Puedes ver la lista, pero no
            subir archivos.
          </Alert>
        )}
      </CardBody>
      <DocumentTable documents={documents} canDelete={canUpload} />
    </Card>
  );
}
