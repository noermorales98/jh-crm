"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui";
import {
  finalizeDisputeLetter,
  markDisputeLetterSent,
} from "@/src/actions/letters";
import { playActionResult } from "@/src/lib/cuelume";
import { notifyEmbedRefresh } from "@/src/lib/embed-refresh";

export function LetterActions({
  letterId,
  status,
  caseId,
  roundId,
  compact = false,
  onViewLetter,
  onChanged,
}: {
  letterId: string;
  status: string;
  caseId: string;
  roundId: string;
  /** En la tabla de la ronda: solo acciones + enlace Ver. */
  compact?: boolean;
  /** Si se pasa, Ver no navega a /crm/casos (embed en modal). */
  onViewLetter?: (letterId: string) => void;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const viewHref = `/crm/casos/${caseId}/rondas/${roundId}/cartas/${letterId}`;
  const pdfHref = `/api/letters/${letterId}/pdf`;

  function afterMutation() {
    router.refresh();
    notifyEmbedRefresh();
    onChanged?.();
  }

  function ViewControl() {
    if (onViewLetter) {
      return (
        <button
          type="button"
          onClick={() => onViewLetter(letterId)}
          className="text-sm font-medium text-action-primary hover:text-action-secondary"
        >
          Ver
        </button>
      );
    }
    return (
      <Link
        href={viewHref}
        className="text-sm font-medium text-action-primary hover:text-action-secondary"
      >
        Ver
      </Link>
    );
  }

  if (status === "READY_FOR_REVIEW" || status === "DRAFT") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        {compact ? <ViewControl /> : null}
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await finalizeDisputeLetter(letterId);
              playActionResult(result.ok);
              if (result.ok) afterMutation();
            });
          }}
        >
          {pending ? "Confirmando…" : "Confirmar final"}
        </Button>
      </div>
    );
  }

  if (status === "FINAL") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ViewControl />
        <a
          href={pdfHref}
          className="text-sm font-medium text-action-primary hover:text-action-secondary"
        >
          Descargar PDF
        </a>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await markDisputeLetterSent(letterId, {});
              playActionResult(result.ok);
              if (result.ok) afterMutation();
            });
          }}
        >
          Marcar enviada
        </Button>
      </div>
    );
  }

  if (status === "SENT") {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ViewControl />
        <a
          href={pdfHref}
          className="text-sm font-medium text-action-primary hover:text-action-secondary"
        >
          Descargar PDF
        </a>
      </div>
    );
  }

  return <ViewControl />;
}
