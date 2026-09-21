"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  FileText,
  NotebookPen,
  Package,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/src/components/ui";
import { CreateTaskButton } from "@/src/components/tasks/create-task-button";
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { CreateRoundButton } from "@/src/components/rounds/create-round-button";
import { UploadDocumentButton } from "@/src/components/clients/quick-add-document-button";
import { ClientNoteQuickModal } from "@/src/components/clients/client-note-quick-modal";

type MemberOption = { id: string; name: string };

const itemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover";

/**
 * Menú compacto de acciones rápidas en el Resumen del cliente.
 */
export function ClientQuickAdd({
  clientId,
  caseId,
  serviceCaseId,
  members,
  canTask,
  canDocument,
  canPayment,
  canReport,
  canRound,
  canNote,
  canServiceNote,
  canQuote,
}: {
  clientId: string;
  caseId: string | null;
  serviceCaseId?: string | null;
  members: MemberOption[];
  canTask: boolean;
  canDocument: boolean;
  canPayment: boolean;
  canReport: boolean;
  canRound: boolean;
  canNote: boolean;
  /** Si true, la nota se asocia al ServiceCase/CreditCase activo. */
  canServiceNote?: boolean;
  canQuote?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const hasAny =
    canTask ||
    canDocument ||
    canPayment ||
    canReport ||
    canRound ||
    canNote ||
    canQuote;
  if (!hasAny) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus className="size-3.5" aria-hidden />
        Agregar
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-[13.5rem] overflow-hidden rounded-control border border-border-subtle bg-surface-panel py-1"
        >
          {canNote ? (
            <button
              type="button"
              role="menuitem"
              className={itemClass}
              onClick={() => {
                setOpen(false);
                setNoteOpen(true);
              }}
            >
              <NotebookPen
                className="size-3.5 shrink-0 text-text-secondary"
                aria-hidden
              />
              Nota
            </button>
          ) : null}
          {canDocument ? (
            <UploadDocumentButton
              clientId={clientId}
              caseId={caseId}
              menuItem
              label="Documento"
            />
          ) : null}
          {canQuote ? (
            <Link
              role="menuitem"
              href={`/crm/cotizaciones/nueva?clientId=${clientId}${
                caseId ? `&caseId=${caseId}` : ""
              }`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <FileText
                className="size-3.5 shrink-0 text-text-secondary"
                aria-hidden
              />
              Cotización
            </Link>
          ) : null}
          {canPayment ? (
            <Link
              role="menuitem"
              href={`/crm/pagos/nuevo?clientId=${clientId}${
                caseId ? `&caseId=${caseId}` : ""
              }`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              <CreditCard
                className="size-3.5 shrink-0 text-text-secondary"
                aria-hidden
              />
              Registrar pago
            </Link>
          ) : null}
          {canTask ? (
            <div
              className="border-t border-border-subtle px-2 py-1.5 [&_button]:w-full [&_button]:justify-start"
              onClick={() => setOpen(false)}
            >
              <CreateTaskButton
                members={members}
                fixedClientId={clientId}
                fixedCaseId={caseId ?? undefined}
                label="+ Tarea"
              />
            </div>
          ) : null}
          {canReport && caseId ? (
            <div
              className="flex items-center gap-2 px-2 py-1.5 [&_button]:w-full [&_button]:justify-start"
              onClick={() => setOpen(false)}
            >
              <Package
                className="size-3.5 shrink-0 text-text-secondary"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <CreateCreditReportButton caseId={caseId} />
              </div>
            </div>
          ) : null}
          {canRound && caseId ? (
            <div
              className="flex items-center gap-2 px-2 py-1.5 [&_button]:w-full [&_button]:justify-start"
              onClick={() => setOpen(false)}
            >
              <RefreshCcw
                className="size-3.5 shrink-0 text-text-secondary"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <CreateRoundButton caseId={caseId} />
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <ClientNoteQuickModal
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        clientId={clientId}
        caseId={canServiceNote ? caseId : null}
        serviceCaseId={canServiceNote ? (serviceCaseId ?? null) : null}
      />
    </div>
  );
}
