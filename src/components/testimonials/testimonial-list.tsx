"use client";

import Link from "next/link";
import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Field,
  Input,
  Textarea,
  Pill,
  StatusPill,
} from "@/src/components/ui";
import { TESTIMONIAL_CONSENT_TEXT } from "@/src/lib/testimonials";
import { playActionResult } from "@/src/lib/cuelume";
import {
  changeTestimonialAction,
  changePortalTestimonialAction,
} from "@/src/actions/testimonials";
import type { TestimonialCommand } from "@/src/server/testimonials";
import { TestimonialForm } from "./testimonial-form";

export type TestimonialView = {
  id: string;
  clientId: string;
  clientName: string;
  displayName: string;
  body: string;
  rating: number | null;
  serviceCaseId: string | null;
  caseNumber: string | null;
  status: string;
  updatedAt: string;
  publishedAt: string | null;
  consentActive: boolean;
  consentSignerName: string | null;
  consentEvidence: string | null;
  consentGrantedAt: string | null;
  consentRevokedAt: string | null;
  reviewedAt: string | null;
};
export function TestimonialList({
  rows,
  manage,
  publish,
  portal = false,
  cases = [],
}: {
  rows: TestimonialView[];
  manage: boolean;
  publish: boolean;
  portal?: boolean;
  cases?: { id: string; label: string }[];
}) {
  if (!rows.length)
    return (
      <p className="py-6 text-sm text-text-secondary">
        Todavía no hay testimonios.
      </p>
    );
  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <TestimonialItem
          key={`${row.id}-${row.updatedAt}`}
          row={row}
          manage={manage}
          publish={publish}
          portal={portal}
          cases={cases}
        />
      ))}
    </div>
  );
}
function TestimonialItem({
  row,
  manage,
  publish,
  portal,
  cases,
}: {
  row: TestimonialView;
  manage: boolean;
  publish: boolean;
  portal: boolean;
  cases: { id: string; label: string }[];
}) {
  const uid = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const run = (command: TestimonialCommand) => {
    setError(null);
    startTransition(async () => {
      const result = await (
        portal ? changePortalTestimonialAction : changeTestimonialAction
      )(row.id, row.updatedAt, command);
      playActionResult(result.ok);
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  };
  return (
    <Card>
      <CardHeader
        title={row.displayName}
        description={row.caseNumber ?? "Testimonio general"}
      />
      <CardBody>
        {!portal ? (
          <Link
            className="text-sm text-action-primary"
            href={`/crm/clientes/${row.clientId}/testimonios`}
          >
            {row.clientName} · Ver ficha
          </Link>
        ) : null}
        <div className="my-3 flex flex-wrap gap-2">
          <StatusPill domain="testimonial" value={row.status} />
          <Pill tone={row.publishedAt ? "blue" : "slate"}>
            {row.publishedAt ? "Publicado" : "Sin publicar"}
          </Pill>
          <Pill tone={row.consentActive ? "green" : "amber"}>
            {row.consentActive
              ? "Consentimiento vigente"
              : "Sin consentimiento vigente"}
          </Pill>
          {row.rating ? <Pill>{row.rating}/5</Pill> : null}
        </div>
        <p className="whitespace-pre-wrap text-sm text-ink">{row.body}</p>
        {row.consentGrantedAt ? (
          <p className="mt-3 text-xs text-text-secondary">
            Consentimiento: {row.consentSignerName} ·{" "}
            {new Date(row.consentGrantedAt).toLocaleDateString("es")}
            {row.consentRevokedAt ? " · Retirado o invalidado por edición" : ""}
          </p>
        ) : null}
        {!portal && row.consentEvidence ? (
          <p className="mt-1 whitespace-pre-wrap text-xs text-text-secondary">
            Evidencia: {row.consentEvidence}
          </p>
        ) : null}
        {row.reviewedAt ? (
          <p className="mt-1 text-xs text-text-secondary">
            Revisado: {new Date(row.reviewedAt).toLocaleDateString("es")}
          </p>
        ) : null}
        <div className="my-4 flex flex-wrap gap-2">
          {manage ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setEditing(!editing)}
            >
              {editing ? "Cancelar edición" : "Editar"}
            </Button>
          ) : null}
          {manage && row.consentActive ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run({ kind: "consent", granted: false })}
            >
              Retirar consentimiento
            </Button>
          ) : null}
          {publish && row.status !== "APPROVED" ? (
            <Button
              size="sm"
              disabled={pending || !row.consentActive}
              onClick={() => run({ kind: "review", status: "APPROVED" })}
            >
              Aprobar
            </Button>
          ) : null}
          {publish && row.status !== "REJECTED" ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => run({ kind: "review", status: "REJECTED" })}
            >
              Rechazar
            </Button>
          ) : null}
          {publish && row.status === "APPROVED" ? (
            <Button
              size="sm"
              disabled={pending || !row.consentActive}
              onClick={() =>
                run({ kind: "publish", published: !row.publishedAt })
              }
            >
              {row.publishedAt ? "Retirar publicación" : "Publicar"}
            </Button>
          ) : null}
          {manage && !portal ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Eliminar este testimonio y retirarlo de publicación?",
                  )
                )
                  run({ kind: "delete" });
              }}
            >
              Eliminar
            </Button>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="mb-3 text-sm text-danger-ink">
            {error}
          </p>
        ) : null}
        {editing ? (
          <TestimonialForm
            clientId={row.clientId}
            cases={
              cases.length
                ? cases
                : row.serviceCaseId
                  ? [
                      {
                        id: row.serviceCaseId,
                        label: row.caseNumber ?? "Expediente actual",
                      },
                    ]
                  : []
            }
            initial={row}
            portal={portal}
            onSaved={() => setEditing(false)}
          />
        ) : null}
        {manage && !row.consentActive && !editing ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-action-primary">
              {portal ? "Autorizar publicación" : "Registrar consentimiento"}
            </summary>
            <form
              className="mt-3 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                run({
                  kind: "consent",
                  granted: true,
                  signerName: String(data.get("signerName")),
                  evidence: String(data.get("evidence") || "") || undefined,
                });
              }}
            >
              <p className="text-sm text-text-secondary">
                {TESTIMONIAL_CONSENT_TEXT}
              </p>
              <Field
                label="Nombre de quien autoriza"
                htmlFor={`${uid}-signer`}
                required
              >
                <Input
                  id={`${uid}-signer`}
                  name="signerName"
                  required
                  maxLength={120}
                  disabled={pending}
                  defaultValue={portal ? row.clientName : ""}
                />
              </Field>
              {!portal ? (
                <Field
                  label="Evidencia del consentimiento"
                  htmlFor={`${uid}-evidence`}
                  required
                  hint="Fecha, canal y referencia del mensaje o documento donde el cliente aceptó la autorización."
                >
                  <Textarea
                    id={`${uid}-evidence`}
                    name="evidence"
                    required
                    maxLength={2000}
                    disabled={pending}
                  />
                </Field>
              ) : null}
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" required disabled={pending} />
                <span>
                  {portal
                    ? "Acepto esta autorización para el testimonio mostrado."
                    : "Confirmo que el cliente aceptó esta autorización y que la evidencia corresponde al texto y nombre público mostrados."}
                </span>
              </label>
              <Button type="submit" size="sm" disabled={pending}>
                Guardar consentimiento
              </Button>
            </form>
          </details>
        ) : null}
      </CardBody>
    </Card>
  );
}
