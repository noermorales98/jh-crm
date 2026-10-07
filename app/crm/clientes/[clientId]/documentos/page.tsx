import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as clientService from "@/src/server/clients";
import * as documentService from "@/src/server/documents";
import { isStorageConfigured } from "@/src/lib/storage/s3";
import { DomainError } from "@/src/server/errors";
import { clientFullName } from "@/src/server/page-helpers";
import { ClientDocumentsPanel } from "@/src/components/clients/client-documents-panel";
import { AgencyClientShell } from "@/src/components/clients/agency-client-shell";

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
  const documents = await documentService.listDocuments(ctx, {
    clientId: client.id,
    limit: 50,
  });

  return (
    <AgencyClientShell
      clientId={client.id}
      fullName={clientFullName(client)}
      status={client.status}
      title="Documentos"
    >
      <ClientDocumentsPanel
        clientId={client.id}
        documents={documents.items}
        canUpload={canUpload}
        storageReady={isStorageConfigured()}
      />
    </AgencyClientShell>
  );
}
