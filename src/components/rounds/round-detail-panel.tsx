import { notFound } from "next/navigation";
import Link from "next/link";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as roundService from "@/src/server/rounds";
import * as documentService from "@/src/server/documents";
import { listMemberOptions, clientFullName } from "@/src/server/page-helpers";
import { DomainError } from "@/src/server/errors";
import { isStorageConfigured } from "@/src/lib/storage/s3";
import { Alert, Card, CardBody, CardHeader, StatusPill } from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { RoundActions } from "@/src/components/rounds/round-actions";
import { DocumentUploader } from "@/src/components/documents/document-uploader";
import { DocumentTable } from "@/src/components/documents/document-table";

export async function RoundDetailPanel({ roundId }: { roundId: string }) {
  const ctx = await requireOrganization();
  let round: Awaited<ReturnType<typeof roundService.getRound>>;
  try {
    round = await roundService.getRound(ctx, roundId);
  } catch (error) {
    if (error instanceof DomainError) notFound();
    throw error;
  }

  const canManage = can(ctx.role, "rounds.manage");
  const canUpload = can(ctx.role, "documents.upload");
  const storageReady = isStorageConfigured();
  const members = canManage ? await listMemberOptions(ctx) : [];
  const overdue =
    round.expectedReviewAt &&
    new Date(round.expectedReviewAt) < new Date() &&
    ["SENT", "WAITING_UPDATE", "REVIEWING"].includes(round.status);

  const documents = await documentService.listDocuments(ctx, {
    clientId: round.case.client.id,
    caseId: round.case.id,
    roundId: round.id,
    limit: 50,
  });

  return (
    <div className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold text-ink">
          Ronda {round.roundNumber}
        </h2>
        <div className="mt-2">
          <StatusPill domain="round" value={round.status} />
        </div>
      </div>

      <Card>
        <CardHeader title="Detalle" />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Caso</dt>
              <dd>
                <Link
                  href={`/crm/casos/${round.case.id}/rondas`}
                  className="text-action-primary hover:text-action-secondary"
                >
                  {round.case.caseCode}
                </Link>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Cliente</dt>
              <dd>
                <Link
                  href={`/crm/clientes?id=${round.case.client.id}`}
                  className="text-action-primary hover:text-action-secondary"
                >
                  {clientFullName(round.case.client)}
                </Link>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Creada</dt>
              <dd>{formatDate(round.startedAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Enviada</dt>
              <dd>{round.sentAt ? formatDate(round.sentAt) : "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Revisión esperada</dt>
              <dd className={overdue ? "font-medium text-danger-ink" : ""}>
                {round.expectedReviewAt ? formatDate(round.expectedReviewAt) : "—"}
                {overdue ? " · vencida" : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Cartas</dt>
              <dd>{round.lettersCount}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-secondary">Ítems disputados</dt>
              <dd>{round.disputedItemsCount}</dd>
            </div>
          </dl>
          {round.notes ? (
            <p className="mt-4 whitespace-pre-wrap text-sm text-text-secondary-strong">
              {round.notes}
            </p>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Documentos de la ronda"
          description="Cartas, reportes y adjuntos de esta ronda."
          compact
        />
        <CardBody className="space-y-3 px-4 py-3">
          {storageReady ? (
            canUpload ? (
              <DocumentUploader
                clientId={round.case.client.id}
                caseId={round.case.id}
                roundId={round.id}
              />
            ) : (
              <Alert tone="info">
                Tu rol es de solo lectura: no puedes subir documentos.
              </Alert>
            )
          ) : (
            <Alert tone="info">
              El almacenamiento de archivos no está configurado en este entorno
              (faltan variables S3). La lista sigue disponible, pero la subida
              está deshabilitada.
            </Alert>
          )}
        </CardBody>
        {documents.items.length > 0 ? (
          <DocumentTable documents={documents.items} canDelete={canUpload} />
        ) : (
          <p className="border-t border-border-subtle px-4 py-3 text-sm text-text-secondary">
            Aún no hay documentos en esta ronda.
          </p>
        )}
      </Card>

      {canManage ? (
        <RoundActions roundId={round.id} status={round.status} members={members} />
      ) : null}
    </div>
  );
}
