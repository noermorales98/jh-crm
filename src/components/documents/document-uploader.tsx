"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import {
  Alert,
  Button,
  ConfirmDialog,
  Field,
  Modal,
  Select,
} from "@/src/components/ui";
import {
  DOCUMENT_CATEGORY_LABELS,
  DOCUMENT_SENSITIVITY_LABELS,
} from "@/src/lib/labels";
import { classifyUploadError } from "@/src/lib/uploads/fetch-error";
import { chooseCrmUploadStrategy } from "@/src/lib/uploads/crm-upload-strategy";
import {
  formatUploadMaxMb,
  getUploadMaxBytesForCategory,
} from "@/src/lib/storage/policy";
import {
  getCreditPdfImportJobAction,
  startCreditPdfImportAction,
} from "@/src/actions/credit-import";
import { playActionResult } from "@/src/lib/cuelume";
import { useCreditPdfImportLock } from "@/src/components/credit-reports/credit-pdf-import-lock";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];
const PDF_ONLY = ["application/pdf"];

type UploadAnalysis = {
  status: string;
  message?: string;
  jobId?: string;
  caseId?: string;
  progressPath?: string;
  openCases?: Array<{ id: string; label: string }>;
};

type UploadOkData = {
  id: string;
  storageKey: string;
  analysis?: UploadAnalysis;
};

/**
 * Wizard de subida: (1) categoría + sensibilidad → (2) archivo.
 * Híbrido: same-origin bajo 4 MB; upload-url → PUT firmado → confirm a partir de 4 MB
 * (evita el body máximo de Vercel Functions ~4.5 MB).
 * PDFs CREDIT_REPORT/UPDATE_REPORT pueden encolar análisis automático.
 * Con prominent/allowUndo: tras subir, modal de éxito + panel (sin dropzone) + progreso.
 */
export function DocumentUploader({
  clientId,
  caseId,
  roundId,
  wizard = true,
  onUploaded,
  initialCategory,
  initialSensitivity,
  hideCategoryStep = false,
  allowUndo = false,
  pdfOnly = false,
  prominent = false,
}: {
  clientId: string;
  caseId?: string;
  roundId?: string;
  /** Si true, pide categoría/sensibilidad antes de mostrar el dropzone. */
  wizard?: boolean;
  onUploaded?: () => void | Promise<void>;
  /** Categoría al abrir. El wizard de Documentos sigue en IDENTITY si no se pasa. */
  initialCategory?: string;
  initialSensitivity?: string;
  /** Oculta el paso de tipo. La categoría queda fija en `initialCategory`. */
  hideCategoryStep?: boolean;
  /** Deshacer borra el archivo recién subido. No cancela un análisis ya encolado. */
  allowUndo?: boolean;
  /** Solo PDF. El wizard de Documentos sigue aceptando JPG y PNG. */
  pdfOnly?: boolean;
  /** Zona alta, centrada, con botón. El wizard de Documentos sigue compacto. */
  prominent?: boolean;
}) {
  const router = useRouter();
  const { engageLock, releaseLock } = useCreditPdfImportLock();
  const fileRef = useRef<HTMLInputElement>(null);
  const showCategoryStep = wizard && !hideCategoryStep;
  const allowedTypes = pdfOnly ? PDF_ONLY : ALLOWED;
  const [step, setStep] = useState<1 | 2>(showCategoryStep ? 1 : 2);
  const [category, setCategory] = useState(initialCategory ?? "IDENTITY");
  const [sensitivity, setSensitivity] = useState(
    initialSensitivity ?? "CONFIDENTIAL",
  );
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [analysisInfo, setAnalysisInfo] = useState<UploadAnalysis | null>(null);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [chosenCaseId, setChosenCaseId] = useState("");
  const [casePending, startCaseTransition] = useTransition();

  const maxBytes = getUploadMaxBytesForCategory(category);
  const maxMbLabel = formatUploadMaxMb(maxBytes);
  const showPostUploadPanel =
    Boolean(pendingDocId) && (prominent || allowUndo);
  const analysisQueued =
    analysisInfo?.status === "queued" || analysisInfo?.status === "existing";

  function applyUploadResult(fileName: string, data: UploadOkData) {
    setPendingDocId(data.id);
    setUploadedFileName(fileName);
    const analysis = data.analysis ?? null;
    setAnalysisInfo(analysis);
    if (analysis?.openCases?.[0]) {
      setChosenCaseId(analysis.openCases[0].id);
    }
    if (
      analysis &&
      (analysis.status === "queued" || analysis.status === "existing") &&
      analysis.jobId &&
      analysis.caseId &&
      analysis.progressPath
    ) {
      engageLock({
        jobId: analysis.jobId,
        caseId: analysis.caseId,
        progressPath: analysis.progressPath,
        fileName,
      });
    }

    if (prominent || allowUndo) {
      setSuccess(null);
      setSuccessModalOpen(true);
    } else if (analysis?.message) {
      setSuccess(`“${fileName}” listo. ${analysis.message}`);
    } else {
      setSuccess(`“${fileName}” listo.`);
    }
  }

  async function uploadFile(file: File) {
    setError(null);
    setSuccess(null);
    setAnalysisInfo(null);
    setPendingDocId(null);
    setUploadedFileName(null);
    setSuccessModalOpen(false);

    if (!allowedTypes.includes(file.type)) {
      setError(
        pdfOnly
          ? "Solo se acepta un PDF de crédito."
          : "Solo se aceptan PDF, JPG y PNG.",
      );
      return;
    }
    if (file.size > maxBytes) {
      setError(`El archivo excede el límite de ${maxMbLabel} MB.`);
      return;
    }

    const strategy = chooseCrmUploadStrategy(file.size);

    try {
      const data =
        strategy === "same-origin"
          ? await uploadSameOrigin(file)
          : await uploadPresigned(file);

      applyUploadResult(file.name, data);
      if (fileRef.current) fileRef.current.value = "";
      await onUploaded?.();
      router.refresh();
    } catch (err) {
      const classified = classifyUploadError({
        error: err,
        phase: strategy === "presigned" ? "put" : "upload",
      });
      setError(classified.message);
    } finally {
      setBusy(null);
    }
  }

  async function uploadSameOrigin(file: File): Promise<UploadOkData> {
    setBusy("Subiendo…");
    const form = new FormData();
    form.set("file", file);
    form.set("clientId", clientId);
    if (caseId) form.set("caseId", caseId);
    if (roundId) form.set("roundId", roundId);
    form.set("category", category);
    form.set("sensitivity", sensitivity);
    form.set("originalName", file.name);

    const res = await fetch("/api/files/upload", {
      method: "POST",
      body: form,
      redirect: "manual",
    });

    assertNotAuthRedirect(res);

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    const payload = json as
      | { ok: true; data: UploadOkData }
      | { ok: false; error: string }
      | null;

    if (!res.ok || !payload || payload.ok !== true) {
      const classified = classifyUploadError({
        error: new Error(
          payload && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "No se pudo subir el archivo.",
        ),
        phase: "upload",
        httpStatus: res.status,
        responseBody: json,
      });
      throw new Error(classified.message);
    }
    return payload.data;
  }

  async function uploadPresigned(file: File): Promise<UploadOkData> {
    setBusy("Preparando…");
    const prepRes = await fetch("/api/files/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        caseId: caseId ?? null,
        roundId: roundId ?? null,
        category,
        sensitivity,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
      redirect: "manual",
    });

    assertNotAuthRedirect(prepRes);

    let prepJson: unknown = null;
    try {
      prepJson = await prepRes.json();
    } catch {
      prepJson = null;
    }

    const prepPayload = prepJson as
      | {
          ok: true;
          data: { url: string; storageKey: string };
        }
      | { ok: false; error: string }
      | null;

    if (!prepRes.ok || !prepPayload || prepPayload.ok !== true) {
      const classified = classifyUploadError({
        error: new Error(
          prepPayload &&
            "error" in prepPayload &&
            typeof prepPayload.error === "string"
            ? prepPayload.error
            : "No se pudo preparar la subida.",
        ),
        phase: "prepare",
        httpStatus: prepRes.status,
        responseBody: prepJson,
      });
      throw new Error(classified.message);
    }

    setBusy("Subiendo…");
    try {
      const put = await fetch(prepPayload.data.url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        throw new Error("La subida al almacenamiento falló.");
      }
    } catch (err) {
      const classified = classifyUploadError({
        error: err,
        phase: "put",
      });
      throw new Error(classified.message);
    }

    setBusy("Registrando…");
    const confirmRes = await fetch("/api/files/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storageKey: prepPayload.data.storageKey,
        clientId,
        caseId: caseId ?? null,
        roundId: roundId ?? null,
        category,
        sensitivity,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      }),
      redirect: "manual",
    });

    assertNotAuthRedirect(confirmRes);

    let confirmJson: unknown = null;
    try {
      confirmJson = await confirmRes.json();
    } catch {
      confirmJson = null;
    }

    const confirmPayload = confirmJson as
      | { ok: true; data: UploadOkData }
      | { ok: false; error: string }
      | null;

    if (!confirmRes.ok || !confirmPayload || confirmPayload.ok !== true) {
      const classified = classifyUploadError({
        error: new Error(
          confirmPayload &&
            "error" in confirmPayload &&
            typeof confirmPayload.error === "string"
            ? confirmPayload.error
            : "No se pudo registrar el archivo.",
        ),
        phase: "confirm",
        httpStatus: confirmRes.status,
        responseBody: confirmJson,
      });
      throw new Error(classified.message);
    }
    return confirmPayload.data;
  }

  function startAnalysisForChosenCase() {
    if (!pendingDocId || !chosenCaseId) {
      setError("Elige un caso de crédito.");
      return;
    }
    setError(null);
    startCaseTransition(async () => {
      const result = await startCreditPdfImportAction({
        caseId: chosenCaseId,
        documentId: pendingDocId,
      });
      if (!result.ok) {
        playActionResult(false);
        setError(result.error);
        return;
      }
      playActionResult(true);
      engageLock({
        jobId: result.data.jobId,
        caseId: result.data.caseId,
        progressPath: result.data.progressPath,
        fileName: uploadedFileName,
      });
      setAnalysisInfo({
        status: "queued",
        jobId: result.data.jobId,
        caseId: result.data.caseId,
        progressPath: result.data.progressPath,
        message: "Análisis encolado para el caso elegido.",
      });
      if (showPostUploadPanel) {
        setSuccess(null);
      } else {
        setSuccess("Análisis encolado. Puedes cerrar la app y volver luego.");
        router.push(result.data.progressPath);
      }
    });
  }

  function takeFile(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadFile(file);
  }

  async function undoUpload(): Promise<string | void> {
    if (!pendingDocId || undoing) return "Espera un momento…";
    const wasQueued = analysisQueued;
    setUndoing(true);
    setError(null);
    try {
      const res = await fetch(`/api/files/${pendingDocId}`, {
        method: "DELETE",
        redirect: "error",
      });
      let json: unknown = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      const payload = json as { ok?: boolean; error?: string } | null;
      if (!res.ok || !payload?.ok) {
        const classified = classifyUploadError({
          error: new Error(payload?.error ?? "No se pudo quitar el PDF."),
          phase: "delete",
          httpStatus: res.status,
          responseBody: json,
        });
        playActionResult(false);
        setError(classified.message);
        return classified.message;
      }
      setPendingDocId(null);
      setAnalysisInfo(null);
      setUploadedFileName(null);
      setSuccessModalOpen(false);
      releaseLock();
      playActionResult(true);
      setSuccess(
        wasQueued
          ? "PDF quitado. El análisis ya estaba encolado y no se cancela."
          : "PDF quitado.",
      );
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err) {
      playActionResult(false);
      const message = classifyUploadError({
        error: err,
        phase: "delete",
      }).message;
      setError(message);
      return message;
    } finally {
      setUndoing(false);
    }
  }

  const modalTitle = pdfOnly ? "PDF listo" : "Documento listo";
  const modalBody = [
    uploadedFileName ? `“${uploadedFileName}”` : null,
    analysisInfo?.message,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!showPostUploadPanel && success ? (
        <Alert tone="success">{success}</Alert>
      ) : null}
      {showPostUploadPanel && success && !pendingDocId ? (
        <Alert tone="success">{success}</Alert>
      ) : null}

      <Modal
        open={successModalOpen}
        onClose={() => setSuccessModalOpen(false)}
        title={modalTitle}
        footer={
          <Button type="button" onClick={() => setSuccessModalOpen(false)}>
            Entendido
          </Button>
        }
      >
        <p className="text-sm leading-relaxed text-text-secondary-strong">
          {modalBody || "El archivo se guardó correctamente."}
        </p>
      </Modal>

      {/* Fallback: sin permiso cases.manage (STAFF+ auto-crea el caso al subir). */}
      {analysisInfo?.status === "needs_case" ? (
        <Alert tone="info">
          {analysisInfo.message}{" "}
          <Link
            href={`/crm/clientes/${clientId}`}
            className="font-medium underline"
          >
            Ir al cliente
          </Link>
        </Alert>
      ) : null}

      {analysisInfo?.status === "needs_case_choice" &&
      analysisInfo.openCases?.length ? (
        <div className="space-y-2 rounded-control border border-border-subtle bg-surface-app p-3">
          <p className="text-sm text-text-secondary">{analysisInfo.message}</p>
          <Field label="Caso de crédito" htmlFor="upload-case-choice">
            <Select
              id="upload-case-choice"
              value={chosenCaseId}
              onChange={(e) => setChosenCaseId(e.target.value)}
            >
              {analysisInfo.openCases.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Button
            type="button"
            size="sm"
            disabled={casePending || !chosenCaseId}
            onClick={startAnalysisForChosenCase}
          >
            {casePending ? "Encolando…" : "Analizar con este caso"}
          </Button>
        </div>
      ) : null}

      {!showPostUploadPanel &&
      analysisInfo &&
      (analysisInfo.status === "queued" || analysisInfo.status === "existing") &&
      analysisInfo.progressPath ? (
        <Alert tone="info">
          {analysisInfo.message}{" "}
          <Link
            href={analysisInfo.progressPath}
            className="font-medium underline"
          >
            Ver progreso
          </Link>
        </Alert>
      ) : null}

      {analysisInfo?.status === "skipped_permission" ? (
        <Alert tone="info">{analysisInfo.message}</Alert>
      ) : null}

      {showPostUploadPanel && pendingDocId ? (
        <div className="space-y-4 rounded-surface border border-border-subtle bg-surface-app px-5 py-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-success-soft text-success-ink">
              <CheckCircle2 className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold text-ink">
                {uploadedFileName
                  ? `“${uploadedFileName}” subido`
                  : "Documento subido"}
              </p>
              <p className="mt-0.5 text-[13px] text-text-secondary">
                {analysisQueued
                  ? "El análisis corre en el servidor."
                  : "El archivo quedó guardado."}
              </p>
            </div>
          </div>

          {allowUndo ? (
            <ConfirmDialog
              title="¿Quitar este PDF?"
              message={
                analysisQueued
                  ? "Se eliminará el archivo. El análisis ya encolado no se cancela."
                  : "Se eliminará el archivo que acabas de subir."
              }
              confirmLabel="Quitar"
              cancelLabel="Cancelar"
              danger
              onConfirm={undoUpload}
              trigger={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={undoing || busy !== null}
                >
                  {undoing ? "Quitando…" : "Deshacer"}
                </Button>
              }
            />
          ) : null}

          {analysisInfo?.jobId ? (
            <CreditUploadProgress
              jobId={analysisInfo.jobId}
              progressPath={analysisInfo.progressPath}
            />
          ) : null}
        </div>
      ) : null}

      {showCategoryStep && !showPostUploadPanel ? (
        <p className="text-xs text-text-secondary">
          Paso {step} de 2 ·{" "}
          {step === 1 ? "Tipo de documento" : "Subir archivo"}
        </p>
      ) : null}

      {!showPostUploadPanel && step === 1 ? (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-text-secondary">
                Categoría
              </span>
              <Select
                id="doc-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-h-10 py-2 text-sm"
              >
                {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold text-text-secondary">
                Sensibilidad
              </span>
              <Select
                id="doc-sensitivity"
                value={sensitivity}
                onChange={(e) => setSensitivity(e.target.value)}
                className="min-h-10 py-2 text-sm"
              >
                {Object.entries(DOCUMENT_SENSITIVITY_LABELS).map(
                  ([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ),
                )}
              </Select>
            </label>
          </div>
          <div className="flex justify-end">
            <Button type="button" onClick={() => setStep(2)}>
              Continuar
            </Button>
          </div>
        </div>
      ) : null}

      {!showPostUploadPanel && step === 2 ? (
        <div className="space-y-2">
          {showCategoryStep ? (
            <button
              type="button"
              className="text-xs font-medium text-action-primary hover:underline"
              onClick={() => setStep(1)}
            >
              ← Cambiar categoría
            </button>
          ) : null}
          <input
            ref={fileRef}
            id={prominent ? "credit-pdf-file" : "doc-file"}
            type="file"
            accept={pdfOnly ? ".pdf,application/pdf" : ".pdf,.jpg,.jpeg,.png"}
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => takeFile(e.target.files)}
          />
          {prominent ? (
            <div
              role="group"
              aria-label="Subir PDF de crédito"
              onClick={() => {
                if (busy === null) fileRef.current?.click();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (busy === null) takeFile(e.dataTransfer.files);
              }}
              className={`flex min-h-44 flex-col items-center justify-center gap-3 rounded-surface border-2 border-dashed px-6 py-8 text-center transition-colors ${
                busy !== null ? "cursor-wait" : "cursor-pointer"
              } ${
                dragging
                  ? "border-action-primary bg-nav-active"
                  : "border-border-subtle bg-surface-app hover:border-action-primary hover:bg-nav-hover"
              }`}
            >
              {busy ? (
                <Loader2
                  className="size-8 animate-spin text-action-primary"
                  aria-hidden
                />
              ) : (
                <span className="flex size-12 items-center justify-center rounded-full bg-action-primary/10 text-action-primary">
                  <FileUp className="size-6" aria-hidden />
                </span>
              )}
              <span>
                <span className="block text-[15px] font-semibold text-ink">
                  {busy ??
                    (dragging ? "Suelta el PDF" : "Arrastra el PDF aquí")}
                </span>
                <span className="mt-1 block text-[13px] text-text-secondary">
                  {busy
                    ? "Espera a que termine."
                    : "o haz clic para elegirlo"}
                </span>
                <span className="mt-1 block text-xs text-text-secondary">
                  PDF · máximo {maxMbLabel} MB
                </span>
              </span>
              <Button
                type="button"
                disabled={busy !== null}
                onClick={(event) => {
                  event.stopPropagation();
                  fileRef.current?.click();
                }}
              >
                Subir PDF
              </Button>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => fileRef.current?.click()}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                setDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                takeFile(e.dataTransfer.files);
              }}
              className={`flex w-full items-center gap-3 rounded-control border border-dashed px-3 py-4 text-left transition-colors ${
                dragging
                  ? "border-action-primary bg-nav-active"
                  : "border-border-subtle bg-surface-app hover:border-action-primary hover:bg-nav-hover"
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              {busy ? (
                <Loader2
                  className="size-5 shrink-0 animate-spin text-action-primary"
                  aria-hidden
                />
              ) : (
                <FileUp className="size-5 shrink-0 text-action-primary" aria-hidden />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">
                  {busy ?? (dragging ? "Suelta el archivo" : "Suelta aquí o haz clic")}
                </span>
                <span className="block text-xs text-text-secondary">
                  {pdfOnly ? "PDF" : "PDF, JPG o PNG"} · máximo {maxMbLabel} MB
                </span>
              </span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function CreditUploadProgress({
  jobId,
  progressPath,
}: {
  jobId: string;
  progressPath?: string;
}) {
  const [status, setStatus] = useState<string>("QUEUED");
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(5);
  const [phaseLabel, setPhaseLabel] = useState<string | null>("En cola");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [path, setPath] = useState(progressPath ?? null);
  const [reportPath, setReportPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | undefined;

    async function tick() {
      const result = await getCreditPdfImportJobAction(jobId);
      if (cancelled) return;
      if (!result.ok) {
        setErrorMessage(result.error);
        return;
      }
      const job = result.data;
      setStatus(job.status);
      setPhase(job.phase);
      setProgress(Math.max(job.progress, 5));
      setPhaseLabel(job.phaseLabel);
      setPath(job.progressPath);
      setReportPath(job.reportPath ?? null);
      if (job.status === "FAILED") {
        setErrorMessage(job.errorMessage ?? "El análisis falló.");
      }
      if (job.status !== "QUEUED" && job.status !== "RUNNING" && intervalId) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    }

    void tick();
    intervalId = window.setInterval(() => {
      void tick();
    }, 2000);

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [jobId]);

  const running = status === "QUEUED" || status === "RUNNING";
  const applied = status === "SUCCEEDED" && phase === "confirmed";
  const needsReview =
    status === "SUCCEEDED" && phase !== "confirmed" && phase !== "confirming";
  const failed = status === "FAILED";
  const successHref = reportPath ?? path;

  return (
    <div className="space-y-2">
      {running ? (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-sm font-medium text-ink">Analizando PDF…</p>
            <p className="text-xs text-text-secondary">{progress}%</p>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progreso del análisis"
          >
            <div
              className="h-full bg-action-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-text-secondary">
            {phaseLabel ?? "Procesando"}
            {" · "}
            reportes largos: varios minutos (varias pasadas de IA)
          </p>
        </>
      ) : null}

      {applied ? (
        <Alert tone="success">
          Reporte aplicado al expediente.{" "}
          {successHref ? (
            <Link href={successHref} className="font-medium underline">
              Ver reporte
            </Link>
          ) : null}
        </Alert>
      ) : null}

      {needsReview ? (
        <Alert tone="info">
          Análisis listo — requiere revisión.{" "}
          {path ? (
            <Link href={path} className="font-medium underline">
              Revisar propuesta
            </Link>
          ) : null}
        </Alert>
      ) : null}

      {failed ? (
        <Alert tone="error">
          {errorMessage ?? "El análisis falló."}
          {path ? (
            <>
              {" "}
              <Link href={path} className="font-medium underline">
                Ver detalle
              </Link>
            </>
          ) : null}
        </Alert>
      ) : null}

      {running && path ? (
        <Link
          href={path}
          className="inline-block text-xs font-medium text-action-primary underline"
        >
          Abrir análisis
        </Link>
      ) : null}
    </div>
  );
}

function assertNotAuthRedirect(res: Response) {
  if (
    res.type === "opaqueredirect" ||
    res.status === 0 ||
    (res.status >= 300 && res.status < 400)
  ) {
    throw new Error(
      "Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.",
    );
  }
}
