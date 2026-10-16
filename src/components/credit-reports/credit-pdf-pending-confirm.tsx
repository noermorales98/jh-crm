import Link from "next/link";
import { FileCheck2 } from "lucide-react";
import type { PendingConfirmCreditPdfJob } from "@/src/server/credit-import/jobs";
import { ButtonLink } from "@/src/components/ui";
import {
  PENDING_CONFIRM_HINT,
  PENDING_CONFIRM_TITLE,
} from "@/src/lib/credit/pending-confirm-copy";

export { PENDING_CONFIRM_HINT, PENDING_CONFIRM_TITLE };

export function CreditPdfPendingConfirmBanner({
  jobs,
}: {
  jobs: PendingConfirmCreditPdfJob[];
}) {
  if (jobs.length === 0) return null;

  return (
    <section
      aria-labelledby="pdf-pending-confirm-heading"
      className="space-y-3 rounded-[18px] bg-info-soft/60 px-4 py-4 ring-1 ring-border-subtle/50 sm:px-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-nav-active text-action-primary">
            <FileCheck2 className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2
              id="pdf-pending-confirm-heading"
              className="text-[15px] font-semibold tracking-[-0.02em] text-ink"
            >
              {PENDING_CONFIRM_TITLE}
              {jobs.length > 1 ? (
                <span className="ml-2 tabular-nums text-text-secondary">
                  {jobs.length}
                </span>
              ) : null}
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-text-secondary">
              {PENDING_CONFIRM_HINT}
            </p>
          </div>
        </div>
      </div>

      <ul role="list" className="space-y-2">
        {jobs.map((job) => {
          const meta = [
            job.documentKind,
            job.snapshotCount > 0 ? `${job.snapshotCount} scores` : null,
            job.itemCount > 0 ? `${job.itemCount} ítems` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <li
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-surface-elevated px-3 py-2.5 ring-1 ring-border-subtle/40"
            >
              <div className="min-w-0">
                <p className="truncate text-[14px] font-medium text-ink">
                  {job.fileName ?? "reporte.pdf"}
                </p>
                {meta ? (
                  <p className="mt-0.5 truncate text-[12px] text-text-secondary">
                    {meta}
                  </p>
                ) : null}
              </div>
              <ButtonLink href={job.progressPath} size="sm">
                Revisar y confirmar
              </ButtonLink>
            </li>
          );
        })}
      </ul>

      {jobs.length === 1 ? (
        <p className="text-[11px] text-text-secondary">
          También puedes abrir{" "}
          <Link
            href={jobs[0].progressPath}
            className="font-medium text-action-primary underline-offset-2 hover:underline"
          >
            la propuesta
          </Link>{" "}
          desde el aviso flotante o la campana.
        </p>
      ) : null}
    </section>
  );
}
