"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  FileBarChart,
  Link2,
  Package,
  Plus,
  RefreshCcw,
} from "lucide-react";
import { Button, Modal } from "@/src/components/ui";
import { CreateCreditReportButton } from "@/src/components/credit-reports/create-report-button";
import { AnalyzePdfImportButton } from "@/src/components/credit-reports/analyze-pdf-import";
import { CreateRoundButton } from "@/src/components/rounds/create-round-button";
import { CreateCaseButton } from "@/src/components/cases/create-case-button";
import type {
  ServiceOption,
  StageOption,
} from "@/src/components/cases/create-case-button";
import { UploadDocumentButton } from "@/src/components/clients/quick-add-document-button";
import { CreateIntakeLinkCard } from "@/src/components/intake/create-intake-link-card";

type MemberOption = { id: string; name: string };

const itemClass =
  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-nav-hover";

const disabledItemClass =
  "flex w-full cursor-not-allowed items-center gap-2 px-3 py-1.5 text-left text-sm text-text-placeholder";

/**
 * Menú «Añadir» en el Resumen del cliente (rondas, servicios, pagos, docs, reportes, intake).
 */
export function ClientQuickAdd({
  clientId,
  caseId,
  caseState = null,
  members,
  stages = [],
  services = [],
  intakeCases = [],
  intakeLinks = [],
  intakeEnabled = false,
  canDocument,
  canPayment,
  canReport,
  canRound,
  canService,
  canIntake,
}: {
  clientId: string;
  caseId: string | null;
  /** Estado del CreditCase activo (OPEN requerido para rondas). */
  caseState?: string | null;
  members: MemberOption[];
  stages?: StageOption[];
  services?: ServiceOption[];
  intakeCases?: { id: string; caseCode: string }[];
  intakeLinks?: {
    id: string;
    url: string;
    caseCode: string | null;
    maxUses: number;
    useCount: number;
    expiresAt: Date | string | null;
    usable: boolean;
    isActive: boolean;
  }[];
  intakeEnabled?: boolean;
  canDocument: boolean;
  canPayment: boolean;
  canReport: boolean;
  canRound: boolean;
  canService: boolean;
  canIntake: boolean;
}) {
  const canCreateRound = Boolean(
    canRound && caseId && caseState === "OPEN",
  );
  const roundBlockedReason = !caseId
    ? "Crea un servicio de crédito primero"
    : caseState && caseState !== "OPEN"
      ? "El caso debe estar abierto para crear rondas"
      : null;
  const [open, setOpen] = useState(false);
  const [intakeOpen, setIntakeOpen] = useState(false);
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
    canService ||
    canDocument ||
    canPayment ||
    canReport ||
    canRound ||
    (canIntake && intakeEnabled);
  if (!hasAny) return null;

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        size="sm"
        variant="primary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Plus className="size-3.5" aria-hidden />
        Añadir
      </Button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 min-w-[15rem] overflow-hidden rounded-control border border-border-subtle bg-surface-panel py-1 shadow-lg"
        >
          {canRound ? (
            canCreateRound && caseId ? (
              <div onClick={() => setOpen(false)}>
                <CreateRoundButton
                  caseId={caseId}
                  menuItem
                  label="Rondas"
                  stayOnPage
                />
              </div>
            ) : (
              <div
                role="menuitem"
                className={disabledItemClass}
                title={roundBlockedReason ?? "No se puede crear ronda"}
              >
                <RefreshCcw className="size-3.5 shrink-0" aria-hidden />
                Rondas
                {roundBlockedReason ? (
                  <span className="ml-auto max-w-[6.5rem] truncate text-[10px]">
                    {caseId ? "Caso cerrado" : "Sin caso"}
                  </span>
                ) : null}
              </div>
            )
          ) : null}

          {canService ? (
            <div onClick={() => setOpen(false)}>
              <CreateCaseButton
                clientId={clientId}
                stages={stages}
                services={services}
                members={members}
                menuItem
                label="Servicios"
              />
            </div>
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
              Pagos
            </Link>
          ) : null}

          {canDocument ? (
            <UploadDocumentButton
              clientId={clientId}
              caseId={caseId}
              menuItem
              label="Documentos"
            />
          ) : null}

          {canReport ? (
            caseId ? (
              <>
                <div
                  className="border-t border-border-subtle px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-text-secondary"
                  role="presentation"
                >
                  Reportes de crédito
                </div>
                <div onClick={() => setOpen(false)}>
                  <AnalyzePdfImportButton
                    caseId={caseId}
                    menuItem
                    label="Analizar PDF"
                  />
                </div>
                <div onClick={() => setOpen(false)}>
                  <CreateCreditReportButton
                    caseId={caseId}
                    menuItem
                    label="Registrar reporte"
                  />
                </div>
                <Link
                  role="menuitem"
                  href={`/crm/casos/${caseId}/credito`}
                  className={itemClass}
                  onClick={() => setOpen(false)}
                >
                  <FileBarChart
                    className="size-3.5 shrink-0 text-text-secondary"
                    aria-hidden
                  />
                  Ver crédito del caso
                </Link>
              </>
            ) : (
              <div
                role="menuitem"
                className={disabledItemClass}
                title="Crea un servicio de crédito primero"
              >
                <Package className="size-3.5 shrink-0" aria-hidden />
                Reportes de crédito
              </div>
            )
          ) : null}

          {canIntake && intakeEnabled ? (
            <button
              type="button"
              role="menuitem"
              className={`${itemClass} border-t border-border-subtle`}
              onClick={() => {
                setOpen(false);
                setIntakeOpen(true);
              }}
            >
              <Link2
                className="size-3.5 shrink-0 text-text-secondary"
                aria-hidden
              />
              Solicitar información
            </button>
          ) : null}
        </div>
      ) : null}

      <Modal
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        title="Solicitar información al cliente"
        description="Genera un enlace intake para que el cliente envíe datos o documentación."
        size="md"
      >
        <CreateIntakeLinkCard
          clientId={clientId}
          cases={intakeCases}
          existingLinks={intakeLinks}
        />
      </Modal>
    </div>
  );
}
