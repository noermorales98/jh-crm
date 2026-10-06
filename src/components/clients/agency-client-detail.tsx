"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";
import {
  ArrowLeft,
  FileText,
  Pencil,
  Trash2,
  Upload,
  Merge,
  Copy,
  X,
} from "lucide-react";
import type { ClientStatus } from "@prisma/client";
import { Button } from "@/src/components/ui";
import { AgencyModal } from "@/src/components/agency/agency-modal";
import { Capsule, FondifyStatusCapsule } from "@/src/components/agency/capsule";
import { archiveClient, updateClient } from "@/src/actions/clients";
import {
  daysUntil,
  isReviewSoon,
  mapClientToFondifyStatus,
  reviewInLabel,
} from "@/src/lib/fondify/status";

export type AgencyClientDetailProps = {
  client: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    status: ClientStatus;
  };
  fullName: string;
  reportsCount: number;
  roundNumber: number | null;
  nextReviewAt: Date | null;
  caseId: string | null;
  documentsCount: number;
  kpis: {
    porArreglar: number;
    fondeoPotencial: string;
    asesoriaHoy: string;
  };
  quoteHref: string;
  contractHref: string;
  reportHref: string | null;
  avanceHref: string | null;
  intakeUrl: string | null;
  canEdit: boolean;
  salesScript: string;
};

type Panel =
  | null
  | "edit"
  | "delete"
  | "merge"
  | "plan"
  | "analisis"
  | "score"
  | "fondeo"
  | "script";

function KpiCard({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: "danger" | "primary";
}) {
  return (
    <div className="rounded-surface bg-surface-panel px-4 py-3">
      <p className="text-[12px] font-medium text-text-secondary">{label}</p>
      <p
        className={`mt-1 text-[22px] font-semibold tabular-nums tracking-[-0.02em] ${
          emphasis === "danger"
            ? "text-danger-ink"
            : emphasis === "primary"
              ? "text-action-primary"
              : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Tile({
  title,
  subtitle,
  badge,
  onClick,
  href,
}: {
  title: string;
  subtitle: string;
  badge?: string;
  onClick?: () => void;
  href?: string;
}) {
  const className =
    "relative flex min-h-[88px] flex-col justify-between rounded-surface bg-surface-panel p-3.5 text-left transition-colors hover:bg-nav-hover";
  const body = (
    <>
      {badge ? (
        <span className="absolute top-2.5 right-2.5">
          <Capsule tone="accent" size="sm">
            {badge}
          </Capsule>
        </span>
      ) : null}
      <span className="pr-14 text-[15px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </span>
      <span className="text-[13px] text-text-secondary">{subtitle}</span>
    </>
  );
  if (href) {
    return (
      <Link href={href} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}

function InlinePanel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-overlay flex flex-col bg-surface-app">
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-panel px-4 py-3">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1 text-[13px] font-medium text-action-primary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver
        </button>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="flex size-8 items-center justify-center rounded-full hover:bg-nav-hover"
          aria-label="Cerrar"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </div>
  );
}

export function AgencyClientDetail(props: AgencyClientDetailProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [utilPct, setUtilPct] = useState(45);
  const [fondeoForm, setFondeoForm] = useState({
    business: "",
    months: "12",
    naics: "",
    cash: "",
  });
  const [fondeoResult, setFondeoResult] = useState<string | null>(null);

  const bucket = mapClientToFondifyStatus(props.client.status);
  const days = props.nextReviewAt ? daysUntil(props.nextReviewAt) : null;
  const soon = days != null && isReviewSoon(days);
  const showRepairBanner = bucket === "repair" && props.kpis.porArreglar > 0;

  const scoreOrder = useMemo(() => {
    const base = Math.max(100, Math.round(5000 * (utilPct / 100)));
    return [
      { name: "Tarjeta principal", pct: Math.min(utilPct, 90), amount: base },
      {
        name: "Segunda línea",
        pct: Math.max(5, Math.round(utilPct * 0.6)),
        amount: Math.round(base * 0.55),
      },
      {
        name: "Tercera línea",
        pct: Math.max(3, Math.round(utilPct * 0.35)),
        amount: Math.round(base * 0.3),
      },
    ];
  }, [utilPct]);

  function onEdit(formData: FormData) {
    setError(null);
    const firstName = String(formData.get("firstName") ?? "").trim();
    const lastName = String(formData.get("lastName") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    startTransition(async () => {
      const result = await updateClient(props.client.id, {
        firstName,
        lastName: lastName || undefined,
        email: email || undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPanel(null);
      router.refresh();
    });
  }

  function onArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveClient(props.client.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/crm/clientes");
      router.refresh();
    });
  }

  async function copyScript() {
    await navigator.clipboard.writeText(props.salesScript);
  }

  async function copyIntake() {
    if (!props.intakeUrl) return;
    await navigator.clipboard.writeText(props.intakeUrl);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-surface bg-surface-panel p-4">
        <Link
          href="/crm/clientes"
          className="mb-3 inline-flex items-center gap-1 text-[13px] font-medium text-action-primary"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Clientes
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-bold tracking-[-0.02em] text-ink">
                {props.fullName}
              </h1>
              <FondifyStatusCapsule status={props.client.status} />
            </div>
            <p className="mt-1 text-[13px] text-text-secondary">
              {props.client.email ?? "Sin correo"} · {props.reportsCount}{" "}
              reportes
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
              <Capsule tone="accent">
                {props.roundNumber != null
                  ? `Ronda ${props.roundNumber}`
                  : "Ronda —"}
              </Capsule>
              {days != null ? (
                <span
                  className={
                    soon
                      ? "font-medium text-warning-ink"
                      : "text-text-secondary"
                  }
                >
                  {reviewInLabel(days)}
                </span>
              ) : null}
              {props.caseId ? (
                <Link
                  href={`/crm/casos/${props.caseId}/rondas`}
                  className="font-medium text-action-primary"
                >
                  Abrir centro de rondas →
                </Link>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={`/crm/clientes/${props.client.id}/documentos`}
            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control bg-nav-hover px-3 text-[13px] font-medium text-ink transition-colors hover:bg-nav-active"
          >
            <FileText className="size-3.5" aria-hidden />
            Documentos
            <span className="rounded-full bg-nav-hover px-1.5 text-[11px] tabular-nums">
              {props.documentsCount}
            </span>
          </Link>
          {props.canEdit ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setPanel("edit")}
            >
              <Pencil className="size-3.5" aria-hidden />
              Editar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setPanel("merge")}
          >
            <Merge className="size-3.5" aria-hidden />
            Unir expedientes
          </Button>
          {props.canEdit ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="text-danger-ink"
              onClick={() => setPanel("delete")}
            >
              <Trash2 className="size-3.5" aria-hidden />
              Eliminar
            </Button>
          ) : null}
          {props.caseId ? (
            <ButtonLinkish
              href={`/crm/casos/${props.caseId}/credito`}
              label="Subir reporte"
              icon={<Upload className="size-3.5" aria-hidden />}
            />
          ) : (
            <Button type="button" variant="primary" size="sm" disabled>
              <Upload className="size-3.5" aria-hidden />
              Subir reporte
            </Button>
          )}
        </div>
      </div>

      {showRepairBanner ? (
        <div className="rounded-surface bg-warning-soft px-4 py-3 text-[13px] text-warning-ink">
          <strong>Gran oportunidad de reparación.</strong> Este cliente tiene{" "}
          {props.kpis.porArreglar} cuenta
          {props.kpis.porArreglar === 1 ? "" : "s"} negativa
          {props.kpis.porArreglar === 1 ? "" : "s"} que bloquean fondeo.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Por arreglar"
          value={String(props.kpis.porArreglar)}
          emphasis="danger"
        />
        <KpiCard label="Fondeo potencial" value={props.kpis.fondeoPotencial} />
        <KpiCard
          label="Asesoría hoy"
          value={props.kpis.asesoriaHoy}
          emphasis="primary"
        />
      </div>

      <section className="space-y-4 rounded-surface bg-surface-panel p-4">
        <div>
          <h2 className="text-[18px] font-bold text-ink">Action Center</h2>
          <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            1 · Analiza y muestra el valor
          </p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Tile
            title="Reporte de crédito"
            subtitle="El documento completo"
            href={props.reportHref ?? undefined}
            onClick={props.reportHref ? undefined : () => setPanel("plan")}
          />
          <Tile
            title="Plan de Acción"
            subtitle="Lectura + pasos a dar"
            badge="Nuevo"
            onClick={() => setPanel("plan")}
          />
          <Tile
            title="Análisis"
            subtitle="Cuentas negativas"
            badge="Beta"
            onClick={() => setPanel("analisis")}
          />
          <Tile
            title="Score Plan"
            subtitle="Sube el puntaje ya"
            badge="Beta"
            onClick={() => setPanel("score")}
          />
          <Tile
            title="Fondeo"
            subtitle="Cuánto puede conseguir"
            onClick={() => setPanel("fondeo")}
          />
          <Tile
            title="Avance"
            subtitle="Progreso por rondas"
            badge="Beta"
            href={props.avanceHref ?? undefined}
            onClick={props.avanceHref ? undefined : () => setPanel("plan")}
          />
        </div>

        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
            2 · Cierra la venta
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            <Tile
              title="Cotización"
              subtitle="CRM"
              href={props.quoteHref}
            />
            <Tile
              title="Contrato"
              subtitle="CRM"
              href={props.contractHref}
            />
            <Tile
              title="Formulario de Iniciación"
              subtitle={props.intakeUrl ? "Copiar / enviar" : "Sin enlace"}
              onClick={() => setPanel("script")}
            />
          </div>
        </div>

        <div className="rounded-surface bg-surface-app p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[14px] font-semibold text-ink">
              ¿Qué le digo al cliente?
            </h3>
            <Button type="button" variant="secondary" size="sm" onClick={copyScript}>
              <Copy className="size-3.5" aria-hidden />
              Copiar guion
            </Button>
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-secondary">
            {props.salesScript}
          </p>
        </div>
      </section>

      <AgencyModal
        open={panel === "edit"}
        onClose={() => setPanel(null)}
        title="Editar cliente"
      >
        <form action={onEdit} className="space-y-3">
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Nombre</span>
            <input
              name="firstName"
              defaultValue={props.client.firstName}
              required
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Apellido</span>
            <input
              name="lastName"
              defaultValue={props.client.lastName ?? ""}
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          <label className="block text-[13px]">
            <span className="mb-1 block font-medium">Correo</span>
            <input
              name="email"
              type="email"
              defaultValue={props.client.email ?? ""}
              className="w-full rounded-control bg-surface-app px-3 py-2.5 text-sm"
            />
          </label>
          {error ? (
            <p className="text-[13px] text-danger" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" variant="primary" className="w-full" disabled={pending}>
            Guardar cambios
          </Button>
        </form>
      </AgencyModal>

      <AgencyModal
        open={panel === "delete"}
        onClose={() => setPanel(null)}
        title="Eliminar cliente"
      >
        <p className="mb-4 text-[13px] text-text-secondary">
          Esta acción archiva al cliente (no borra datos). Desaparecerá de la
          lista principal.
        </p>
        {error ? (
          <p className="mb-3 text-[13px] text-danger" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => setPanel(null)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="danger"
            className="flex-1"
            disabled={pending}
            onClick={onArchive}
          >
            Archivar
          </Button>
        </div>
      </AgencyModal>

      <AgencyModal
        open={panel === "merge"}
        onClose={() => setPanel(null)}
        title="Unir expedientes"
      >
        <p className="text-[13px] text-text-secondary">
          Unir expedientes aún no está implementado en jh-crm. Esta UI queda
          lista; el merge server llega en un paso posterior (TODO tipado).
        </p>
      </AgencyModal>

      <AgencyModal
        open={panel === "script"}
        onClose={() => setPanel(null)}
        title="Formulario de iniciación"
      >
        {props.intakeUrl ? (
          <div className="space-y-3">
            <p className="break-all rounded-control bg-surface-app px-3 py-2 font-mono text-[12px]">
              {props.intakeUrl}
            </p>
            <Button type="button" variant="primary" className="w-full" onClick={copyIntake}>
              Copiar enlace
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-text-secondary">
            No hay IntakeLink activo para este cliente. Créalo desde documentos
            o intake cuando FEATURE_PUBLIC_INTAKE esté activo.
          </p>
        )}
      </AgencyModal>

      {panel === "plan" ? (
        <InlinePanel title="Análisis de Crédito y Plan de Acción" onClose={() => setPanel(null)}>
          <div className="mx-auto max-w-2xl space-y-4">
            <p className="text-center text-[13px] text-text-secondary">
              Analizando a: <strong className="text-ink">{props.fullName}</strong>
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Capsule tone="danger">No calificado</Capsule>
              <Capsule tone="warning">Estimado fondeo —</Capsule>
              <Capsule tone="accent">{props.reportsCount} reportes</Capsule>
            </div>
            <div className="rounded-surface bg-surface-panel p-4">
              <h3 className="font-semibold text-ink">1 · Desglose por buró</h3>
              <p className="mt-2 text-[13px] text-text-secondary">
                {props.reportsCount > 0
                  ? "Usa el reporte de crédito del caso para scores y utilización. Umbrales guía: score 720 · utilización 10%."
                  : "Aún no hay reporte parseado. Sube un reporte de crédito para llenar este plan."}
              </p>
              {props.reportHref ? (
                <Link
                  href={props.reportHref}
                  className="mt-3 inline-block text-[13px] font-medium text-action-primary"
                >
                  Ver reporte →
                </Link>
              ) : null}
            </div>
            <div className="rounded-surface bg-surface-panel p-4">
              <h3 className="font-semibold text-ink">2 · Estructura</h3>
              <p className="mt-2 text-[13px] text-text-secondary">
                Orden sugerido: bajar utilización → disputar negativos →
                estabilizar 30 días → evaluar fondeo.
              </p>
            </div>
          </div>
        </InlinePanel>
      ) : null}

      {panel === "analisis" ? (
        <InlinePanel title="Cuentas negativas" onClose={() => setPanel(null)}>
          <div className="mx-auto max-w-xl space-y-3">
            <p className="text-[13px] text-text-secondary">
              Negativos: <strong>{props.kpis.porArreglar}</strong>
            </p>
            {props.kpis.porArreglar === 0 ? (
              <p className="rounded-surface bg-surface-panel px-4 py-6 text-center text-[13px] text-text-secondary">
                No hay cuentas negativas cargadas (o no hay reporte parseado).
              </p>
            ) : (
              <p className="rounded-surface bg-surface-panel px-4 py-4 text-[13px] text-text-secondary">
                Hay {props.kpis.porArreglar} ítems negativos en el caso. Abre el
                reporte o el caso de crédito para ver acreedor, buró y disputa.
                {props.caseId ? (
                  <>
                    {" "}
                    <Link
                      href={`/crm/casos/${props.caseId}/credito`}
                      className="font-medium text-action-primary"
                    >
                      Ir al crédito →
                    </Link>
                  </>
                ) : null}
              </p>
            )}
          </div>
        </InlinePanel>
      ) : null}

      {panel === "score" ? (
        <InlinePanel title="Score Plan" onClose={() => setPanel(null)}>
          <div className="mx-auto max-w-lg space-y-4">
            <label className="block text-[13px]">
              <span className="mb-1 block font-medium">
                Utilización simulada: {utilPct}%
              </span>
              <input
                type="range"
                min={5}
                max={95}
                value={utilPct}
                onChange={(e) => setUtilPct(Number(e.target.value))}
                className="w-full"
              />
              <span className="text-text-secondary">
                Targets: 30% / 10%
              </span>
            </label>
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-ink">
                1 · Paga en este orden
              </p>
              {scoreOrder.map((row) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-control bg-surface-panel px-3 py-2 text-[13px]"
                >
                  <span>
                    {row.name} · {row.pct}%
                  </span>
                  <span className="font-mono tabular-nums">
                    ${row.amount.toLocaleString("en-US")}
                  </span>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() =>
                navigator.clipboard.writeText(
                  scoreOrder
                    .map(
                      (r) =>
                        `${r.name}: ${r.pct}% · $${r.amount.toLocaleString("en-US")}`,
                    )
                    .join("\n"),
                )
              }
            >
              Copiar plan para el cliente
            </Button>
          </div>
        </InlinePanel>
      ) : null}

      {panel === "fondeo" ? (
        <InlinePanel title="Calculadora de Fondeo" onClose={() => setPanel(null)}>
          <div className="mx-auto max-w-lg space-y-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-text-secondary">
              Datos del negocio
            </p>
            {(
              [
                ["business", "Nombre del negocio"],
                ["months", "Meses operando"],
                ["naics", "NAICS"],
                ["cash", "Cash en banco (USD)"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-[13px]">
                <span className="mb-1 block font-medium">{label}</span>
                <input
                  value={fondeoForm[key]}
                  onChange={(e) =>
                    setFondeoForm((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                  className="w-full rounded-control bg-surface-panel px-3 py-2.5"
                />
              </label>
            ))}
            <Button
              type="button"
              variant="primary"
              className="w-full"
              onClick={() => {
                const cash = Number(fondeoForm.cash) || 0;
                const months = Number(fondeoForm.months) || 0;
                const estimate = Math.round(cash * 2.5 + months * 1500);
                setFondeoResult(
                  `Estimado heurístico (no API Fondify): $${estimate.toLocaleString("en-US")}`,
                );
              }}
            >
              Calcular fondeo
            </Button>
            {fondeoResult ? (
              <p className="rounded-control bg-surface-panel px-3 py-3 text-[14px] font-semibold text-ink">
                {fondeoResult}
              </p>
            ) : null}
          </div>
        </InlinePanel>
      ) : null}
    </div>
  );
}

function ButtonLinkish({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-control bg-action-primary px-3 text-[13px] font-semibold text-action-primary-foreground transition-colors hover:bg-action-secondary"
    >
      {icon}
      {label}
    </Link>
  );
}
