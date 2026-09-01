import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as documentService from "@/src/server/documents";
import { isStorageConfigured } from "@/src/lib/storage/s3";
import { listMemberOptions } from "@/src/server/page-helpers";
import { formatDateTime } from "@/src/lib/format";
import { DomainError } from "@/src/server/errors";
import { Alert, Card, CardBody, CardHeader } from "@/src/components/ui";
import { ClientForm, type ClientFormValues } from "@/src/components/clients/client-form";
import { SensitiveProfileForm } from "@/src/components/clients/sensitive-profile-form";
import { DocumentUploader } from "@/src/components/documents/document-uploader";
import { DocumentTable } from "@/src/components/documents/document-table";
import { ClientHeader } from "../client-header";

export const metadata: Metadata = {
  title: "Expediente del cliente",
};

export default async function ClientRecordPage({
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
  const canEdit = can(ctx.role, "clients.edit");
  const canSensitiveView = can(ctx.role, "sensitive.view");
  const canSensitiveEdit = can(ctx.role, "sensitive.edit");
  const canUpload = can(ctx.role, "documents.upload");
  const storageReady = isStorageConfigured();

  const [members, documents] = await Promise.all([
    canEdit ? listMemberOptions(ctx) : Promise.resolve([]),
    documentService.listDocuments(ctx, { clientId: client.id, limit: 50 }),
  ]);

  const formValues: ClientFormValues = {
    firstName: client.firstName,
    lastName: client.lastName ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    addressLine1: client.addressLine1 ?? "",
    addressLine2: client.addressLine2 ?? "",
    city: client.city ?? "",
    state: client.state ?? "",
    postalCode: client.postalCode ?? "",
    source: client.source ?? "",
    status: client.status,
    assignedToId: client.assignedToId ?? "",
  };

  return (
    <div>
      <ClientHeader client={client} />

      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Datos del cliente"
            description="Información general de contacto y dirección."
          />
          <CardBody>
            {client.status === "ARCHIVED" ? (
              <div className="mb-4">
                <Alert tone="info">
                  Este cliente está archivado; no se puede editar sin cambiar su estado.
                </Alert>
              </div>
            ) : null}
            {canEdit ? (
              <ClientForm
                mode="edit"
                clientId={client.id}
                initialValues={formValues}
                members={members}
              />
            ) : (
              <Alert tone="info">
                Tu rol es de solo lectura: no puedes editar los datos del cliente.
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Datos sensibles"
            description="SSN, fecha de nacimiento y licencia. Se guardan cifrados y cada acceso queda auditado."
          />
          <CardBody>
            {canSensitiveEdit ? (
              <SensitiveProfileForm
                clientId={client.id}
                ssnMasked={client.ssnMasked}
                updatedAt={
                  client.sensitiveProfileUpdatedAt
                    ? formatDateTime(client.sensitiveProfileUpdatedAt)
                    : null
                }
              />
            ) : canSensitiveView ? (
              <Alert tone="info">
                SSN registrado: {client.ssnMasked ?? "no registrado"}. Tu rol
                permite ver pero no editar el perfil sensible.
              </Alert>
            ) : (
              <Alert tone="info">
                <span className="inline-flex items-center gap-1.5">
                  <ShieldAlert className="size-4" aria-hidden />
                  Tu rol no tiene acceso a los datos sensibles de este cliente.
                </span>
              </Alert>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Documentos del cliente"
            description="Identificaciones, comprobantes y reportes. Los archivos viven en almacenamiento privado."
          />
          <CardBody className="space-y-6">
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
                El almacenamiento de archivos no está configurado en este
                entorno (faltan variables S3). La lista de documentos sigue
                disponible, pero la subida está deshabilitada.
              </Alert>
            )}
          </CardBody>
          <DocumentTable documents={documents.items} canDelete={canUpload} />
        </Card>
      </div>
    </div>
  );
}
