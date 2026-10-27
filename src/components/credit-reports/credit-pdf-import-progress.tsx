"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Button,
  DateInput,
  Field,
  Input,
  Select,
  Textarea,
} from "@/src/components/ui";
import {
  confirmCreditPdfImportAction,
  getCreditPdfImportJobAction,
  saveCreditPdfImportDraftAction,
} from "@/src/actions/credit-import";
import { playActionResult } from "@/src/lib/cuelume";
import { formatDate } from "@/src/lib/format";
import { kickCreditPdfImportProcess } from "@/src/lib/credit/kick-pdf-import";
import {
  CREDIT_BUREAU_LABELS,
  CREDIT_REPORT_TYPE_LABELS,
} from "@/src/lib/labels";
import {
  defaultPdfItemSelection,
  pdfImportConfirmBlocked,
  proposedPdfReportDate,
} from "@/src/lib/credit/pdf-review";
import { reviewFields, summarizeReview } from "@/src/lib/credit/review";
import type { CreditPdfExtractionProposal } from "@/src/lib/validation/credit-import";
import { useCreditPdfImportLock } from "./credit-pdf-import-lock";
import {
  PENDING_CONFIRM_REVIEW_HEADING,
  PENDING_CONFIRM_REVIEW_SUB,
} from "@/src/lib/credit/pending-confirm-copy";
import { creditAnalysisHref } from "@/src/lib/routes/case-routes";
import { useCaseHref } from "@/src/lib/routes/use-case-href";

const CLIENT_KEYS = [
  "firstName",
  "lastName",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
] as const;

type ClientKey = (typeof CLIENT_KEYS)[number];

type JobView = {
  id: string;
  caseId: string;
  documentId: string;
  status: string;
  phase: string | null;
  phaseLabel: string | null;
  progress: number;
  fileName: string | null;
  errorMessage: string | null;
  extractMode: string | null;
  pageCount: number | null;
  suggestedReportType: "INITIAL" | "UPDATE" | "MANUAL" | null;
  proposal: CreditPdfExtractionProposal | null;
  currentClient: {
    firstName: string;
    lastName: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    country: string | null;
    ssnLast4: string | null;
    hasDateOfBirth: boolean;
  } | null;
  progressPath: string;
  reportId?: string | null;
  reportPath?: string | null;
};

function empty(v: string | null | undefined) {
  return !v?.trim();
}

/** Tope de espera de la publicación automática antes de pedir revisión. */
const PUBLISH_WAIT_MS = 90_000;

export function CreditPdfImportProgressClient({
  caseId,
  jobId,
  initialJob,
}: {
  caseId: string;
  jobId: string;
  initialJob: JobView;
}) {
  const router = useRouter();
  const caseLink = useCaseHref();
  const { engageLock, releaseLock, dismissReadyChip } =
    useCreditPdfImportLock();
  const [job, setJob] = useState(initialJob);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [reportType, setReportType] = useState<"INITIAL" | "UPDATE" | "MANUAL">(
    initialJob.suggestedReportType ?? "UPDATE",
  );
  const [reportDate, setReportDate] = useState(() =>
    proposedPdfReportDate(initialJob.proposal?.report?.reportDate),
  );
  const [provider, setProvider] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<number, boolean>>(
    {},
  );
  const [applyClient, setApplyClient] = useState<
    Partial<Record<ClientKey | "dateOfBirth" | "ssn", boolean>>
  >({});
  const [overwriteClient, setOverwriteClient] = useState(false);
  const [ssnFull, setSsnFull] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [criticalAck, setCriticalAck] = useState(false);

  // Enganchar bloqueo mientras corre
  useEffect(() => {
    if (job.status === "QUEUED" || job.status === "RUNNING") {
      engageLock({
        jobId,
        caseId,
        progressPath: job.progressPath,
        fileName: job.fileName,
      });
    } else {
      releaseLock();
    }
  }, [
    job.status,
    job.progressPath,
    job.fileName,
    jobId,
    caseId,
    engageLock,
    releaseLock,
  ]);

  // Si el job quedó en cola (after() de la action no arrancó), empujar el worker.
  useEffect(() => {
    if (job.status !== "QUEUED") return;
    void kickCreditPdfImportProcess(jobId);
  }, [jobId, job.status]);

  // Publicación automática en curso: se sigue consultando hasta un tope;
  // después se muestra la revisión manual como respaldo.
  const [publishingSince, setPublishingSince] = useState<number | null>(null);
  const [publishTimedOut, setPublishTimedOut] = useState(false);
  const publishingPhase = job.status === "SUCCEEDED" && job.phase === "publishing";
  const publishing = publishingPhase && !publishTimedOut;
  useEffect(() => {
    if (!publishingPhase || publishingSince != null) return;
    const t = window.setTimeout(() => setPublishingSince(Date.now()), 0);
    return () => window.clearTimeout(t);
  }, [publishingPhase, publishingSince]);
  useEffect(() => {
    if (publishingSince == null || publishTimedOut) return;
    const left = PUBLISH_WAIT_MS - (Date.now() - publishingSince);
    const t = window.setTimeout(() => setPublishTimedOut(true), Math.max(left, 0));
    return () => window.clearTimeout(t);
  }, [publishingSince, publishTimedOut]);

  // Poll
  useEffect(() => {
    if (job.status !== "QUEUED" && job.status !== "RUNNING" && !publishing) return;
    const id = window.setInterval(() => {
      startTransition(async () => {
        const result = await getCreditPdfImportJobAction(jobId);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setJob(result.data as JobView);
      });
    }, 2000);
    return () => window.clearInterval(id);
  }, [job.status, jobId, publishing]);

  // Hydrate review form once
  useEffect(() => {
    if (hydrated) return;
    if (job.status !== "SUCCEEDED" || !job.proposal) return;
    const p = job.proposal;
    const cur = job.currentClient;
    const t = window.setTimeout(() => {
      setReportType(job.suggestedReportType ?? "UPDATE");
      setReportDate(proposedPdfReportDate(p.report?.reportDate));
      setProvider(p.report?.provider ?? "");
      setNotes(p.report?.notes ?? "");
      setSelectedItems(defaultPdfItemSelection(p.report?.items?.length ?? 0));
      const clientApply: Partial<
        Record<ClientKey | "dateOfBirth" | "ssn", boolean>
      > = {};
      const c = p.client;
      if (c && cur) {
        for (const key of CLIENT_KEYS) {
          const next = c[key];
          if (next && empty(cur[key])) clientApply[key] = true;
        }
        if (c.dateOfBirth && !cur.hasDateOfBirth) {
          clientApply.dateOfBirth = true;
        }
        if (c.ssnLast4 && !cur.ssnLast4) clientApply.ssn = true;
      }
      setApplyClient(clientApply);
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(t);
  }, [job, hydrated]);

  const proposal = job.proposal;
  const items = useMemo(
    () => proposal?.report?.items ?? [],
    [proposal?.report?.items],
  );
  const snapshots = proposal?.report?.snapshots ?? [];
  const selectedItemIndexes = useMemo(
    () =>
      items
        .map((_, i) => i)
        .filter((i) => selectedItems[i]),
    [items, selectedItems],
  );

  const fields = useMemo(
    () =>
      reviewFields({
        reportDate: proposal?.report?.reportDate,
        snapshots: proposal?.report?.snapshots,
        items: proposal?.report?.items,
      }),
    [proposal],
  );
  const summary = summarizeReview(
    fields,
    criticalAck ? fields.filter((field) => field.critical).map((field) => field.id) : [],
  );
  const confirmBlocked =
    pdfImportConfirmBlocked(proposal?.coverage) ||
    summary.criticalPending.length > 0 ||
    proposedPdfReportDate(reportDate) === "";

  function handleDraft() {
    if (!proposal) return;
    setError(null);
    startTransition(async () => {
      const result = await saveCreditPdfImportDraftAction({
        caseId,
        documentId: job.documentId,
        expectedRevision: proposal.review?.revision ?? 0,
        reason: "borrador de importación",
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
    });
  }

  function handleConfirm() {
    if (!proposal || !job.currentClient || confirmBlocked || proposedPdfReportDate(reportDate) === "") return;
    setError(null);
    startTransition(async () => {
      const result = await confirmCreditPdfImportAction({
        caseId,
        documentId: job.documentId,
        documentKind: proposal.documentKind,
        reportType,
        reportDate,
        provider: provider.trim() || null,
        notes: notes.trim() || null,
        selectedItemIndexes,
        expectedRevision: proposal.review?.revision ?? 0,
        idempotencyKey: jobId,
        reason: "confirmación de importación",
        reviewedFieldIds: fields.filter((field) => field.critical).map((field) => field.id),
        applyClientFields: applyClient,
        clientPatch: proposal.client ?? null,
        ssnFull: ssnFull.trim() || null,
        overwriteClient,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      dismissReadyChip(jobId);
      releaseLock();
      router.push(creditAnalysisHref(result.data.reportId));
      router.refresh();
    });
  }

  const running = job.status === "QUEUED" || job.status === "RUNNING" || publishing;
  const autoApplied =
    job.status === "SUCCEEDED" &&
    job.phase === "confirmed" &&
    Boolean(job.reportPath || job.reportId || proposal?.review?.reportId);

  useEffect(() => {
    if (!autoApplied) return;
    dismissReadyChip(jobId);
    releaseLock();
    const target =
      job.reportPath ??
      (job.reportId
        ? creditAnalysisHref(job.reportId)
        : proposal?.review?.reportId
          ? creditAnalysisHref(proposal.review.reportId)
          : null);
    if (!target) return;
    const t = window.setTimeout(() => {
      router.replace(target);
      router.refresh();
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    autoApplied,
    caseId,
    dismissReadyChip,
    job.reportId,
    job.reportPath,
    jobId,
    proposal?.review?.reportId,
    releaseLock,
    router,
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {error ? <Alert tone="error">{error}</Alert> : null}

      {autoApplied ? (
        <div className="space-y-3 rounded-xl bg-surface-elevated p-6 ring-1 ring-border-subtle">
          <Alert tone="success">
            Reporte aplicado al expediente. Redirigiendo…
          </Alert>
        </div>
      ) : null}

      {running ? (
        <div className="space-y-4 rounded-xl bg-surface-elevated p-6 ring-1 ring-border-subtle">
          <Alert tone="info">
            El análisis corre en el servidor. Puedes cerrar esta pestaña o
            navegar a otra página; vuelve aquí o usa el aviso flotante cuando
            quieras revisar el progreso.
          </Alert>
          <h1 className="text-xl font-semibold text-ink">
            {publishing ? "Publicando el análisis…" : "Analizando PDF…"}
          </h1>
          <p className="text-sm text-text-secondary">
            {job.fileName ?? "reporte.pdf"}
            {job.phaseLabel ? ` · ${job.phaseLabel}` : null}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full bg-action-primary transition-all duration-500"
              style={{ width: `${Math.max(job.progress, 5)}%` }}
            />
          </div>
          <p className="text-xs text-text-secondary">
            {Math.max(job.progress, job.status === "QUEUED" ? 5 : 0)}% ·
            reportes largos: varios minutos (varias pasadas de IA)
            {pending ? " · actualizando…" : null}
          </p>
          <ol className="space-y-1 text-sm text-text-secondary">
            {(
              [
                ["download", "Descargar PDF"],
                ["extract", "Extraer texto"],
                ["ai", "Analizar con IA"],
                ["validate", "Validar"],
                ["publishing", "Publicar en el expediente"],
                ["done", "Listo"],
              ] as const
            ).map(([key, label]) => {
              const order = [
                "download",
                "extract",
                "ai",
                "validate",
                "publishing",
                "done",
              ];
              const cur = order.indexOf(job.phase ?? "download");
              const idx = order.indexOf(key);
              const done = idx <= cur;
              return (
                <li key={key} className={done ? "text-ink font-medium" : ""}>
                  {done ? "✓" : "○"} {label}
                </li>
              );
            })}
          </ol>
        </div>
      ) : null}

      {job.status === "FAILED" ? (
        <div className="space-y-3 rounded-xl bg-surface-elevated p-6 ring-1 ring-border-subtle">
          <Alert tone="error">
            {job.errorMessage ?? "El análisis falló."}
          </Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push(caseLink(caseId, "/credito"))}
          >
            Volver a crédito
          </Button>
        </div>
      ) : null}

      {job.status === "SUCCEEDED" && proposal && !autoApplied && !publishing ? (
        <div className="space-y-4 rounded-xl bg-surface-elevated p-6 ring-1 ring-border-subtle">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">
              {PENDING_CONFIRM_REVIEW_HEADING}
            </h1>
            <p className="text-sm text-text-secondary">
              {PENDING_CONFIRM_REVIEW_SUB}
            </p>
          </div>
          <Alert tone="info">
            Tipo: <strong>{proposal.documentKind}</strong> · confianza{" "}
            {proposal.confidence}
            {job.pageCount != null ? ` · ${job.pageCount} págs` : null}
            {job.extractMode ? ` · modo ${job.extractMode}` : null}
            {snapshots.length > 0
              ? ` · ${snapshots.length} score${snapshots.length === 1 ? "" : "s"}`
              : null}
            {items.length > 0
              ? ` · ${items.length} ítem${items.length === 1 ? "" : "s"}`
              : null}
          </Alert>
          {proposal.warnings?.length ? (
            <Alert tone="info">
              <ul className="list-disc pl-4 text-sm">
                {proposal.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo de reporte" htmlFor="pdfImportType">
              <Select
                id="pdfImportType"
                value={reportType}
                onChange={(e) =>
                  setReportType(
                    e.target.value as "INITIAL" | "UPDATE" | "MANUAL",
                  )
                }
              >
                {Object.entries(CREDIT_REPORT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha" htmlFor="pdfImportDate">
              <DateInput
                id="pdfImportDate"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </Field>
            <Field label="Proveedor" htmlFor="pdfImportProvider">
              <Input
                id="pdfImportProvider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
            </Field>
            <Field label="Notas" htmlFor="pdfImportNotes">
              <Textarea
                id="pdfImportNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </Field>
          </div>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-ink">Scores</h4>
            {snapshots.length === 0 ? (
              <p className="text-sm text-text-secondary">Sin scores.</p>
            ) : (
              <ul className="grid gap-1 sm:grid-cols-3">
                {snapshots.map((s) => (
                  <li
                    key={s.bureau}
                    className="rounded-control bg-surface-muted px-3 py-2 text-sm"
                  >
                    {CREDIT_BUREAU_LABELS[s.bureau] ?? s.bureau}:{" "}
                    <strong>{s.score ?? "—"}</strong>
                    {s.modelFamily ? ` · ${s.modelFamily}` : " · sin modelo, no certificado"}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {proposal.documentKind !== "CLIENT_PROGRESS_REPORT" ? (
            <section className="space-y-2">
              <h4 className="text-sm font-semibold text-ink">
                Cuentas ({selectedItemIndexes.length}/{items.length}) · desconocidos {summary.unknown}
              </h4>
              <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                {items.map((item, i) => (
                  <li key={`${item.creditorName}-${i}`}>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(selectedItems[i])}
                        onChange={(e) =>
                          setSelectedItems((prev) => ({
                            ...prev,
                            [i]: e.target.checked,
                          }))
                        }
                      />
                      <span>
                        <span className="font-medium">{item.creditorName}</span>{" "}
                        · {CREDIT_BUREAU_LABELS[item.bureau] ?? item.bureau}
                        {item.isNegative ? " · negativo" : ""}
                        {item.dateOpened ? ` · abierta ${formatDate(item.dateOpened, "UTC")}` : ""}
                        {item.dateReported ? ` · reportada ${formatDate(item.dateReported, "UTC")}` : ""}
                        {item.sourcePage ? ` · p.${item.sourcePage}` : ""}
                        {item.fieldQuality?.family
                          ? ` · ${item.fieldQuality.family} ${item.fieldQuality.familyQuality ?? ""}`
                          : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {job.currentClient ? (
            <section className="space-y-2 border-t border-border-subtle pt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-ink">
                  Datos del cliente
                </h4>
                <label className="flex items-center gap-2 text-xs text-text-secondary">
                  <input
                    type="checkbox"
                    checked={overwriteClient}
                    onChange={(e) => setOverwriteClient(e.target.checked)}
                  />
                  Sobrescribir aunque ya existan
                </label>
              </div>
              <ul className="space-y-1 text-sm">
                {CLIENT_KEYS.map((key) => {
                  const next = proposal.client?.[key];
                  if (!next) return null;
                  const cur = job.currentClient![key];
                  return (
                    <li key={key}>
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={Boolean(applyClient[key])}
                          onChange={(e) =>
                            setApplyClient((p) => ({
                              ...p,
                              [key]: e.target.checked,
                            }))
                          }
                        />
                        <span>
                          <span className="font-medium">{key}</span>:{" "}
                          <span className="text-text-secondary">
                            {cur || "—"}
                          </span>{" "}
                          → {next}
                        </span>
                      </label>
                    </li>
                  );
                })}
                {proposal.client?.dateOfBirth ? (
                  <li>
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(applyClient.dateOfBirth)}
                        onChange={(e) =>
                          setApplyClient((p) => ({
                            ...p,
                            dateOfBirth: e.target.checked,
                          }))
                        }
                      />
                      <span>DOB → {proposal.client.dateOfBirth}</span>
                    </label>
                  </li>
                ) : null}
                {proposal.client?.ssnLast4 ? (
                  <li className="space-y-2">
                    <label className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={Boolean(applyClient.ssn)}
                        onChange={(e) =>
                          setApplyClient((p) => ({
                            ...p,
                            ssn: e.target.checked,
                          }))
                        }
                      />
                      <span>SSN last4 → ****{proposal.client.ssnLast4}</span>
                    </label>
                    {applyClient.ssn ? (
                      <Field
                        label="SSN completo (opcional)"
                        htmlFor="pdfImportSsn"
                      >
                        <Input
                          id="pdfImportSsn"
                          type="password"
                          autoComplete="off"
                          value={ssnFull}
                          onChange={(e) => setSsnFull(e.target.value)}
                        />
                      </Field>
                    ) : null}
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}

          {pdfImportConfirmBlocked(proposal?.coverage) ? (
            <Alert tone="error">
              La extracción quedó parcial. No se publican las cuentas ni las métricas hasta completarla.
            </Alert>
          ) : null}

          <label className="flex items-start gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              className="mt-1"
              checked={criticalAck}
              onChange={(event) => setCriticalAck(event.target.checked)}
            />
            <span>Revisé la fecha, los scores y las coincidencias pendientes.</span>
          </label>

          <div className="flex justify-end gap-2 border-t border-border-subtle pt-3">
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => router.push(caseLink(caseId, "/credito"))}
            >
              Más tarde
            </Button>
            <Button type="button" variant="ghost" disabled={pending} onClick={handleDraft}>
              Guardar borrador
            </Button>
            <Button type="button" disabled={pending || confirmBlocked} onClick={handleConfirm}>
              {pending ? "Guardando…" : "Confirmar importación"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
