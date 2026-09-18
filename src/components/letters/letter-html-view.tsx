import Link from "next/link";
import { Download } from "lucide-react";
import { buttonClasses } from "@/src/components/ui";
import { formatForPdf } from "@/src/lib/format/dates";

export function LetterHtmlView({
  organizationName,
  organizationContact,
  recipient,
  subject,
  body,
  issuedAt,
  timezone,
  folio,
  caseId,
  roundId,
  downloadHref,
  backHref,
}: {
  organizationName: string;
  organizationContact?: string | null;
  recipient: string;
  subject: string;
  body: string;
  issuedAt: Date;
  timezone?: string;
  folio: string;
  caseId: string;
  roundId: string;
  downloadHref: string;
  backHref: string;
}) {
  const paragraphs = body
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={backHref}
          className="text-sm font-medium text-action-primary hover:text-action-secondary"
        >
          ← Volver a la ronda
        </Link>
        <a href={downloadHref} className={buttonClasses("primary", "sm")}>
          <Download className="size-4" aria-hidden />
          Descargar PDF
        </a>
      </div>

      <article className="rounded-control border border-border-subtle bg-surface-panel px-8 py-10">
        <header className=" pb-6">
          <p className="text-lg font-semibold text-ink">{organizationName}</p>
          {organizationContact ? (
            <p className="mt-1 text-sm text-text-secondary">{organizationContact}</p>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm text-text-secondary">
            <span>Carta de disputa</span>
            <span className="tabular-nums">{folio}</span>
          </div>
        </header>

        <div className="mt-6 space-y-3 text-sm text-ink">
          <p>
            <span className="text-text-secondary">Fecha: </span>
            {formatForPdf(issuedAt, timezone)}
          </p>
          <p>
            <span className="text-text-secondary">Destinatario: </span>
            {recipient}
          </p>
          <p className="font-medium">
            <span className="text-text-secondary font-normal">Asunto: </span>
            {subject}
          </p>
        </div>

        <div className="mt-8 space-y-4 text-[15px] leading-relaxed text-ink">
          {paragraphs.map((p, i) => (
            <p key={`${i}-${p.slice(0, 24)}`}>{p}</p>
          ))}
        </div>

        <p className="mt-10 text-xs text-text-secondary">
          Documento generado para revisión interna. No constituye asesoría legal.
        </p>
        <p className="mt-2 text-xs text-text-placeholder">
          Caso {caseId.slice(-6)} · Ronda {roundId.slice(-6)}
        </p>
      </article>
    </div>
  );
}
