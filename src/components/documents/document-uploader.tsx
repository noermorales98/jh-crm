"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, Loader2 } from "lucide-react";
import { Alert, Button, Field, Select } from "@/src/components/ui";
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
import { startCreditPdfImportAction } from "@/src/actions/credit-import";
import { playActionResult } from "@/src/lib/cuelume";
import { useCreditPdfImportLock } from "@/src/components/credit-reports/credit-pdf-import-lock";

const ALLOWED = ["application/pdf", "image/jpeg", "image/png"];

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
 */
export function DocumentUploader({
  clientId,
  caseId,
  roundId,
  wizard = true,
  onUploaded,
}: {
  clientId: string;
  caseId?: string;
  roundId?: string;
  /** Si true, pide categoría/sensibilidad antes de mostrar el dropzone. */
  wizard?: boolean;
  onUploaded?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const { engageLock } = useCreditPdfImportLock();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2>(wizard ? 1 : 2);
  const [category, setCategory] = useState("IDENTITY");
  const [sensitivity, setSensitivity] = useState("CONFIDENTIAL");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [analysisInfo, setAnalysisInfo] = useState<UploadAnalysis | null>(null);
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [chosenCaseId, setChosenCaseId] = useState("");
  const [casePending, startCaseTransition] = useTransition();

  const maxBytes = getUploadMaxBytesForCategory(category);
  const maxMbLabel = formatUploadMaxMb(maxBytes);

  function applyUploadResult(fileName: string, data: UploadOkData) {
    setPendingDocId(data.id);
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
      setSuccess(`“${fileName}” listo. ${analysis.message ?? ""}`.trim());
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

    if (!ALLOWED.includes(file.type)) {
      setError("Solo se aceptan PDF, JPG y PNG.");
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
        fileName: null,
      });
      setAnalysisInfo({
        status: "queued",
        jobId: result.data.jobId,
        caseId: result.data.caseId,
        progressPath: result.data.progressPath,
        message: "Análisis encolado para el caso elegido.",
      });
      setSuccess("Análisis encolado. Puedes cerrar la app y volver luego.");
      router.push(result.data.progressPath);
    });
  }

  function takeFile(files: FileList | null) {
    const file = files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="space-y-3">
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="success">{success}</Alert> : null}

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

      {analysisInfo &&
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

      {wizard ? (
        <p className="text-xs text-text-secondary">
          Paso {step} de 2 ·{" "}
          {step === 1 ? "Tipo de documento" : "Subir archivo"}
        </p>
      ) : null}

      {step === 1 ? (
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
      ) : (
        <div className="space-y-2">
          {wizard ? (
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
            id="doc-file"
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            className="sr-only"
            disabled={busy !== null}
            onChange={(e) => takeFile(e.target.files)}
          />
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
                PDF, JPG o PNG · máximo {maxMbLabel} MB
              </span>
            </span>
          </button>
        </div>
      )}
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
