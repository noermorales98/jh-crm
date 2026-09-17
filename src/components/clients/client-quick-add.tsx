"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/src/components/ui";
import { CreateTaskButton } from "@/src/components/tasks/create-task-button";
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { CreateRoundButton } from "@/src/components/rounds/create-round-button";
import { QuickAddDocumentButton } from "@/src/components/clients/quick-add-document-button";

type MemberOption = { id: string; name: string };

const itemClass =
  "block w-full px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover";

/**
 * Menú compacto de acciones rápidas en el Resumen del cliente.
 */
export function ClientQuickAdd({
  clientId,
  caseId,
  members,
  canTask,
  canDocument,
  canPayment,
  canReport,
  canRound,
  canNote,
  canQuote,
}: {
  clientId: string;
  caseId: string | null;
  members: MemberOption[];
  canTask: boolean;
  canDocument: boolean;
  canPayment: boolean;
  canReport: boolean;
  canRound: boolean;
  canNote: boolean;
  canQuote?: boolean;
}) {
  const [open, setOpen] = useState(false);
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
          className="absolute right-0 z-40 mt-1 min-w-[12.5rem] overflow-hidden rounded-control border border-border-subtle bg-surface-panel py-1 shadow-md"
        >
          {canNote ? (
            <Link
              role="menuitem"
              href={`/crm/clientes/${clientId}/actividad`}
              className={itemClass}
              onClick={() => setOpen(false)}
            >
              + Nota / actividad
            </Link>
          ) : null}
          {canDocument ? (
            <QuickAddDocumentButton
              clientId={clientId}
              caseId={caseId}
              menuItem
              label="+ Documento"
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
              + Cotización
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
              className="px-2 py-1.5 [&_button]:w-full [&_button]:justify-start"
              onClick={() => setOpen(false)}
            >
              <CreateCreditReportButton caseId={caseId} />
            </div>
          ) : null}
          {canRound && caseId ? (
            <div
              className="px-2 py-1.5 [&_button]:w-full [&_button]:justify-start"
              onClick={() => setOpen(false)}
            >
              <CreateRoundButton caseId={caseId} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
