"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { X } from "lucide-react";
import {
  getCreditPdfImportJobAction,
  listActiveCreditPdfImportJobsAction,
} from "@/src/actions/credit-import";

const STORAGE_KEY = "jh.creditPdfImport.follow";
/** Persistente entre sesiones: un “Análisis listo” aceptado/cerrado no debe volver. */
const DISMISSED_READY_KEY = "jh.creditPdfImport.dismissedReady.v1";

type FollowState = {
  jobId: string;
  caseId: string;
  progressPath: string;
  fileName?: string | null;
};

type Ctx = {
  /** @deprecated Alias de follow; se conserva por callers existentes. */
  lock: FollowState | null;
  engageLock: (lock: FollowState) => void;
  releaseLock: () => void;
  dismissReadyChip: (jobId: string) => void;
  /** Siempre false: el análisis no bloquea navegación ni cierre de pestaña. */
  isLocked: boolean;
};

const CreditPdfImportLockContext = createContext<Ctx | null>(null);

export function useCreditPdfImportLock() {
  const ctx = useContext(CreditPdfImportLockContext);
  if (!ctx) {
    throw new Error(
      "useCreditPdfImportLock debe usarse dentro de CreditPdfImportLockProvider",
    );
  }
  return ctx;
}

function readStored(): FollowState | null {
  try {
    const raw =
      sessionStorage.getItem(STORAGE_KEY) ??
      sessionStorage.getItem("jh.creditPdfImport.lock");
    if (!raw) return null;
    return JSON.parse(raw) as FollowState;
  } catch {
    return null;
  }
}

function readDismissedReady(): Set<string> {
  try {
    const raw =
      localStorage.getItem(DISMISSED_READY_KEY) ??
      sessionStorage.getItem(DISMISSED_READY_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeDismissedReady(ids: Set<string>) {
  try {
    const payload = JSON.stringify([...ids].slice(-80));
    localStorage.setItem(DISMISSED_READY_KEY, payload);
    sessionStorage.removeItem(DISMISSED_READY_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Estado informativo de análisis PDF (chips + polling).
 * No bloquea navegación ni cierre de pestaña: el job sigue en el servidor.
 */
const POLL_ACTIVE_MS = 2500;
const POLL_IDLE_MS = 45_000;

export function CreditPdfImportLockProvider({
  children,
  canManageCreditImports = true,
}: {
  children: ReactNode;
  /** Si false, no se hace polling (rol sin creditReports.manage). */
  canManageCreditImports?: boolean;
}) {
  const [follow, setFollow] = useState<FollowState | null>(null);
  const [dismissedReady, setDismissedReady] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    return readDismissedReady();
  });
  const [chipJobs, setChipJobs] = useState<
    Array<{
      id: string;
      caseId: string;
      status: string;
      progress: number;
      fileName: string | null;
      phase: string | null;
    }>
  >([]);

  const dismissReadyChip = useCallback((jobId: string) => {
    setDismissedReady((prev) => {
      const next = new Set(prev);
      next.add(jobId);
      writeDismissedReady(next);
      return next;
    });
  }, []);

  const engageLock = useCallback((next: FollowState) => {
    setFollow(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      sessionStorage.removeItem("jh.creditPdfImport.lock");
    } catch {
      /* ignore */
    }
  }, []);

  const releaseLock = useCallback(() => {
    setFollow(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem("jh.creditPdfImport.lock");
    } catch {
      /* ignore */
    }
  }, []);

  // Restaurar seguimiento tras refresh si el job sigue activo
  useEffect(() => {
    const stored = readStored();
    if (!stored) return;
    let cancelled = false;
    (async () => {
      const result = await getCreditPdfImportJobAction(stored.jobId);
      if (cancelled) return;
      if (
        result.ok &&
        (result.data.status === "QUEUED" || result.data.status === "RUNNING")
      ) {
        setFollow(stored);
      } else {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
          sessionStorage.removeItem("jh.creditPdfImport.lock");
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll chip jobs — frecuente solo con jobs activos; idle / pestaña oculta = backoff
  useEffect(() => {
    if (!canManageCreditImports) {
      return;
    }

    let cancelled = false;
    let timer: number | null = null;
    let hasActiveJobs = Boolean(follow);

    async function refresh() {
      if (cancelled) return;
      if (document.visibilityState === "hidden") {
        scheduleNext();
        return;
      }
      const result = await listActiveCreditPdfImportJobsAction();
      if (cancelled || !result.ok) {
        scheduleNext();
        return;
      }
      setChipJobs(
        result.data.map((j) => ({
          id: j.id,
          caseId: j.caseId,
          status: j.status,
          progress: j.progress,
          fileName: j.fileName,
          phase: j.phase,
        })),
      );
      hasActiveJobs = result.data.some(
        (j) => j.status === "QUEUED" || j.status === "RUNNING",
      );
      if (follow) {
        const mine = result.data.find((j) => j.id === follow.jobId);
        if (
          mine &&
          (mine.status === "SUCCEEDED" || mine.status === "FAILED")
        ) {
          releaseLock();
        }
      }
      scheduleNext();
    }

    function scheduleNext() {
      if (cancelled) return;
      if (timer != null) window.clearTimeout(timer);
      const delay =
        document.visibilityState === "hidden"
          ? POLL_IDLE_MS
          : hasActiveJobs || follow
            ? POLL_ACTIVE_MS
            : POLL_IDLE_MS;
      timer = window.setTimeout(() => {
        void refresh();
      }, delay);
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    void refresh();

    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [follow, releaseLock, canManageCreditImports]);

  const value = useMemo(
    () => ({
      lock: follow,
      engageLock,
      releaseLock,
      dismissReadyChip,
      isLocked: false,
    }),
    [follow, engageLock, releaseLock, dismissReadyChip],
  );

  const runningChip = chipJobs.find(
    (j) => j.status === "QUEUED" || j.status === "RUNNING",
  );
  const readyChip = chipJobs.find(
    (j) => j.status === "SUCCEEDED" && !dismissedReady.has(j.id),
  );

  return (
    <CreditPdfImportLockContext.Provider value={value}>
      {children}

      {(runningChip || readyChip) && (
        <div className="pointer-events-none fixed bottom-20 right-4 z-[80] flex max-w-sm flex-col gap-2 sm:bottom-6">
          {runningChip ? (
            <div className="pointer-events-auto rounded-xl bg-ink px-4 py-3 text-sm text-white ring-1 ring-white/10">
              <p className="font-semibold">Analizando PDF…</p>
              <p className="mt-0.5 text-xs text-white/80">
                {runningChip.fileName ?? "reporte.pdf"} · {runningChip.progress}
                %
              </p>
              <p className="mt-1 text-[11px] text-white/70">
                Puedes cerrar la app; el análisis sigue en el servidor.
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/20">
                <div
                  className="h-full bg-action-primary transition-all"
                  style={{ width: `${runningChip.progress}%` }}
                />
              </div>
              <Link
                href={`/crm/casos/${runningChip.caseId}/credito/importaciones/${runningChip.id}`}
                className="mt-2 inline-block text-xs font-medium text-white underline"
              >
                Ver progreso
              </Link>
            </div>
          ) : null}
          {readyChip && !runningChip ? (
            <div className="pointer-events-auto relative rounded-xl bg-surface-elevated px-4 py-3 pr-10 text-sm text-ink ring-1 ring-border-subtle">
              <button
                type="button"
                className="absolute right-2 top-2 rounded-md p-1 text-text-secondary hover:bg-nav-hover hover:text-ink"
                aria-label="Cerrar aviso"
                onClick={() => dismissReadyChip(readyChip.id)}
              >
                <X className="size-4" aria-hidden />
              </button>
              <p className="font-semibold">Análisis listo</p>
              <p className="mt-0.5 text-xs text-text-secondary">
                {readyChip.fileName ?? "PDF"} — revisa y confirma
              </p>
              <Link
                href={`/crm/casos/${readyChip.caseId}/credito/importaciones/${readyChip.id}`}
                className="mt-2 inline-block text-xs font-medium text-action-primary underline"
                onClick={() => dismissReadyChip(readyChip.id)}
              >
                Revisar propuesta
              </Link>
              <p className="mt-2 text-[11px] text-text-secondary">
                Historial también en la campana de notificaciones.
              </p>
            </div>
          ) : null}
        </div>
      )}
    </CreditPdfImportLockContext.Provider>
  );
}
