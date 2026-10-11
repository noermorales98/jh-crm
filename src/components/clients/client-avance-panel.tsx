"use client";

import { useEffect, useState } from "react";
import {
  getClientAvanceShareLink,
  loadClientAvance,
} from "@/src/actions/avance";
import type { AvanceViewData } from "@/src/server/avance/view";
import { Button } from "@/src/components/ui";
import { formatDate } from "@/src/lib/format";
import { ROUND_STATUS_LABELS, labelFor } from "@/src/lib/labels";
import {
  CreateCaseButton,
  type ServiceOption,
  type StageOption,
} from "@/src/components/cases/create-case-button";
import { CreateRoundButton } from "@/src/components/rounds/create-round-button";
import { EmbeddedRoundWorkspace } from "@/src/components/rounds/embedded-round-workspace";
import { EmbeddedLetterPanel } from "@/src/components/rounds/embedded-letter-panel";
import { notifyEmbedRefresh } from "@/src/lib/embed-refresh";

type GestionView =
  | { kind: "list" }
  | { kind: "round"; roundId: string }
  | { kind: "letter"; roundId: string; letterId: string };

export function ClientAvancePanel({
  clientId,
  reportId,
  caseId,
  canCreateRound = false,
  canManageCases = false,
  canManageRounds = false,
  stages = [],
  services = [],
  members = [],
  initialRoundId = null,
  initialTab,
}: {
  clientId: string;
  reportId: string | null;
  caseId: string | null;
  canCreateRound?: boolean;
  /** Permiso `cases.manage` (crear expediente Credit Repair). */
  canManageCases?: boolean;
  /** Permiso `rounds.manage` (independiente de tener caso). */
  canManageRounds?: boolean;
  stages?: StageOption[];
  services?: ServiceOption[];
  members?: { id: string; name: string }[];
  /** Deep-link: abrir detalle de ronda en Gestión. */
  initialRoundId?: string | null;
  initialTab?: "gestion" | "cliente";
}) {
  const [tab, setTab] = useState<"gestion" | "cliente">(
    initialTab ?? "gestion",
  );
  const [gestionView, setGestionView] = useState<GestionView>(() =>
    initialRoundId
      ? { kind: "round", roundId: initialRoundId }
      : { kind: "list" },
  );
  const [data, setData] = useState<AvanceViewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0);
  /** Caso creado en este panel antes de que `router.refresh` actualice props. */
  const [createdCaseId, setCreatedCaseId] = useState<string | null>(null);
  const [settledKey, setSettledKey] = useState<string | null>(null);

  const effectiveCaseId = caseId ?? createdCaseId;
  const effectiveCanCreateRound =
    Boolean(effectiveCaseId) &&
    (canCreateRound || (Boolean(createdCaseId) && canManageRounds));
  const loadKey = `${clientId}:${reportId ?? ""}:${effectiveCaseId ?? ""}:${listKey}`;
  const loading = settledKey !== loadKey;

  useEffect(() => {
    let cancelled = false;
    void loadClientAvance({
      clientId,
      reportId,
      caseId: effectiveCaseId,
    }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setData(null);
      } else {
        setError(null);
        setData(res.data);
      }
      setSettledKey(loadKey);
    });
    return () => {
      cancelled = true;
    };
  }, [clientId, reportId, effectiveCaseId, listKey, loadKey]);

  async function copyShareLink() {
    setShareMsg(null);
    const res = await getClientAvanceShareLink({
      clientId,
      reportId,
      caseId: effectiveCaseId,
    });
    if (!res.ok) {
      setShareMsg(res.error);
      return;
    }
    await navigator.clipboard.writeText(res.data.url);
    setShareMsg("Link copiado");
  }

  function emailShare() {
    void getClientAvanceShareLink({
      clientId,
      reportId,
      caseId: effectiveCaseId,
    }).then(
      (res) => {
        if (!res.ok || !data) return;
        const subject = encodeURIComponent(
          `Avance de crédito — ${data.clientName}`,
        );
        const body = encodeURIComponent(
          `Hola,\n\nAquí puedes ver tu avance:\n${res.data.url}\n\n${data.organizationName}`,
        );
        window.open(`mailto:?subject=${subject}&body=${body}`, "_blank");
      },
    );
  }

  function refreshList() {
    setListKey((k) => k + 1);
    notifyEmbedRefresh();
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-[13px] text-text-secondary">
        Cargando avance…
      </p>
    );
  }

  if (error || !data) {
    return (
      <p className="py-6 text-center text-sm text-danger">
        {error ?? "Sin datos de avance"}
      </p>
    );
  }

  const pdfHref = `/api/clients/${clientId}/avance/pdf${
    reportId ? `?reportId=${reportId}` : ""
  }`;

  const showGestionChrome = tab === "gestion";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-full bg-nav-hover p-0.5 text-[12px] font-medium">
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${
              tab === "gestion"
                ? "bg-surface-panel text-ink shadow-sm"
                : "text-text-secondary"
            }`}
            onClick={() => {
              setTab("gestion");
              setGestionView({ kind: "list" });
            }}
          >
            Gestión
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 ${
              tab === "cliente"
                ? "bg-surface-panel text-ink shadow-sm"
                : "text-text-secondary"
            }`}
            onClick={() => setTab("cliente")}
          >
            Vista cliente
          </button>
        </div>
        {tab === "cliente" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={copyShareLink}
            >
              Copiar link para el cliente
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={emailShare}
            >
              Enviar por email
            </Button>
            <a
              href={pdfHref}
              className="inline-flex items-center rounded-control bg-action-primary px-3 py-1.5 text-sm font-medium text-action-primary-foreground"
            >
              Descargar PDF
            </a>
          </div>
        ) : null}
      </div>
      {shareMsg ? (
        <p className="text-center text-[12px] text-text-secondary">{shareMsg}</p>
      ) : null}

      {tab === "cliente" ? (
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              {data.organizationName}
            </p>
            <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.02em] text-ink">
              Avance mensual de {data.clientName}.
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="rounded-full bg-action-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-action-primary">
                {data.roundLabel}
              </span>
              {data.reportDate ? (
                <span className="rounded-full bg-nav-hover px-2.5 py-0.5 text-[11px] text-text-secondary">
                  {formatDate(data.reportDate)}
                </span>
              ) : null}
            </div>
          </div>

          <p className="rounded-surface bg-warning-soft px-3 py-3 text-[13px] text-warning-ink">
            {data.cleanup.negativeTotal > 0
              ? `Encontramos ${data.cleanup.negativeTotal} elementos que trabajar: ${data.cleanup.chargeOffs} charge-offs / colecciones, ${data.cleanup.late} pagos tardíos, ${data.cleanup.inquiries} consultas y ${data.cleanup.personal} datos personales.`
              : data.verdict}
          </p>

          <section>
            <h4 className="text-[13px] font-semibold text-ink">
              Punto de partida del crédito
            </h4>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {data.bureaus.length ? (
                data.bureaus.map((b) => (
                  <div
                    key={b.bureau}
                    className="rounded-control bg-surface-app px-3 py-3 text-center"
                  >
                    <p className="text-[11px] uppercase text-text-secondary">
                      {b.bureau}
                    </p>
                    <p className="mt-1 text-[28px] font-semibold tabular-nums text-ink">
                      {b.score ?? "—"}
                    </p>
                    <p className="text-[11px] text-text-secondary">{b.label}</p>
                  </div>
                ))
              ) : (
                <p className="col-span-full text-[13px] text-text-secondary">
                  Sin scores parseados aún.
                </p>
              )}
            </div>
          </section>

          <section>
            <h4 className="text-[12px] font-semibold uppercase text-text-secondary">
              Qué hay que limpiar
            </h4>
            <div className="mt-2 flex flex-wrap gap-2">
              <StatPill
                label="Charge-offs"
                value={data.cleanup.chargeOffs}
                danger
              />
              <StatPill label="Pagos tardíos" value={data.cleanup.late} danger />
              <StatPill label="Consultas" value={data.cleanup.inquiries} />
              <StatPill
                label="Info personal"
                value={data.cleanup.personal}
              />
            </div>
          </section>
        </div>
      ) : null}

      {showGestionChrome && gestionView.kind === "list" ? (
        <div className="space-y-3">
          {!effectiveCaseId ? (
            canManageCases ? (
              <div className="rounded-surface bg-nav-hover/40 px-3 py-4 ring-1 ring-border-subtle">
                <CreateCaseButton
                  clientId={clientId}
                  stages={stages}
                  services={services}
                  members={members}
                  embedded
                  lockService
                  defaultServiceCode="CREDIT_REPAIR"
                  stayOnPage
                  onCreated={(result) => {
                    if (result.caseId) setCreatedCaseId(result.caseId);
                    refreshList();
                  }}
                />
              </div>
            ) : (
              <p className="rounded-surface bg-nav-hover/50 px-3 py-4 text-center text-[13px] text-text-secondary">
                Este cliente no tiene un expediente de Credit Repair. No tienes
                permiso para crearlo; pide a un administrador que abra el caso.
              </p>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] text-text-secondary">
                  Crea rondas, abre el detalle y marca disputas sin salir del
                  cliente.
                </p>
                {effectiveCanCreateRound && effectiveCaseId ? (
                  <CreateRoundButton
                    caseId={effectiveCaseId}
                    stayOnPage
                    onCreated={(roundId) => {
                      refreshList();
                      setGestionView({ kind: "round", roundId });
                    }}
                  />
                ) : null}
              </div>
              {data.rounds.length === 0 ? (
                <p className="rounded-surface bg-nav-hover/50 px-3 py-4 text-center text-[13px] text-text-secondary">
                  {effectiveCanCreateRound
                    ? "Sin rondas todavía. Crea la primera con «Nueva ronda»."
                    : "Sin rondas todavía."}
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle rounded-surface ring-1 ring-border-subtle">
                  {data.rounds.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setGestionView({ kind: "round", roundId: r.id })
                        }
                        className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-left text-[13px] transition-colors hover:bg-nav-hover/60"
                      >
                        <span className="font-medium text-action-primary">
                          Ronda {r.roundNumber}
                        </span>
                        <span className="text-text-secondary">
                          {labelFor(ROUND_STATUS_LABELS, r.status)}
                          {r.expectedReviewAt
                            ? ` · revisar ${formatDate(r.expectedReviewAt)}`
                            : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : null}

      {showGestionChrome && gestionView.kind === "round" ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setGestionView({ kind: "list" });
              refreshList();
            }}
            className="text-sm font-medium text-action-primary"
          >
            ← Rondas
          </button>
          <EmbeddedRoundWorkspace
            roundId={gestionView.roundId}
            onViewLetter={(letterId) =>
              setGestionView({
                kind: "letter",
                roundId: gestionView.roundId,
                letterId,
              })
            }
          />
        </div>
      ) : null}

      {showGestionChrome && gestionView.kind === "letter" ? (
        <EmbeddedLetterPanel
          letterId={gestionView.letterId}
          onBack={() =>
            setGestionView({ kind: "round", roundId: gestionView.roundId })
          }
        />
      ) : null}
    </div>
  );
}

function StatPill({
  label,
  value,
  danger,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-[12px] font-medium ${
        danger && value > 0
          ? "bg-danger-soft text-danger-ink"
          : "bg-nav-hover text-ink"
      }`}
    >
      {value} {label}
    </span>
  );
}
