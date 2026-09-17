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
import { usePathname, useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  getCreditPdfImportJobAction,
  listActiveCreditPdfImportJobsAction,
} from "@/src/actions/credit-import";
import { Button } from "@/src/components/ui";

const STORAGE_KEY = "jh.creditPdfImport.lock";
const DISMISSED_READY_KEY = "jh.creditPdfImport.dismissedReady";

type LockState = {
  jobId: string;
  caseId: string;
  progressPath: string;
  fileName?: string | null;
};

type Ctx = {
  lock: LockState | null;
  engageLock: (lock: LockState) => void;
  releaseLock: () => void;
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

function readStored(): LockState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as LockState;
  } catch {
    return null;
  }
}

function readDismissedReady(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_READY_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeDismissedReady(ids: Set<string>) {
  try {
    sessionStorage.setItem(
      DISMISSED_READY_KEY,
      JSON.stringify([...ids].slice(-40)),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Bloqueo estricto de navegación mientras hay un análisis PDF en curso.
 * - beforeunload al cerrar pestaña/ventana
 * - captura clics en enlaces internos
 * - chip flotante + overlay de advertencia
 */
export function CreditPdfImportLockProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [lock, setLock] = useState<LockState | null>(null);
  const [warnOpen, setWarnOpen] = useState(false);
  const [dismissedReady, setDismissedReady] = useState<Set<string>>(
    () => new Set(),
  );
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

  useEffect(() => {
    setDismissedReady(readDismissedReady());
  }, []);

  const dismissReadyChip = useCallback((jobId: string) => {
    setDismissedReady((prev) => {
      const next = new Set(prev);
      next.add(jobId);
      writeDismissedReady(next);
      return next;
    });
  }, []);

  const engageLock = useCallback((next: LockState) => {
    setLock(next);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const releaseLock = useCallback(() => {
    setLock(null);
    setWarnOpen(false);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // Restore lock after refresh if job still running
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
        setLock(stored);
      } else {
        try {
          sessionStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // beforeunload — cierra pestaña / ventana / refresh
  useEffect(() => {
    if (!lock) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue =
        "Hay un análisis de PDF en curso. Si cierras, puedes perder el progreso en pantalla (el análisis puede seguir en el servidor).";
      return event.returnValue;
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [lock]);

  // Bloquear clics de navegación interna
  useEffect(() => {
    if (!lock) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      if (event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        setWarnOpen(true);
        return;
      }
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      if (href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) {
        event.preventDefault();
        event.stopPropagation();
        setWarnOpen(true);
        return;
      }
      // Permitir solo la página de progreso de ESTE job
      if (url.pathname === lock.progressPath) return;
      if (url.pathname.startsWith(lock.progressPath + "/")) return;

      event.preventDefault();
      event.stopPropagation();
      setWarnOpen(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [lock]);

  // Si por alguna razón cambiaron de ruta, forzar vuelta (sin setState síncrono)
  useEffect(() => {
    if (!lock) return;
    if (pathname === lock.progressPath) return;
    if (pathname.startsWith(lock.progressPath + "/")) return;
    const t = window.setTimeout(() => {
      setWarnOpen(true);
      router.replace(lock.progressPath);
    }, 0);
    return () => window.clearTimeout(t);
  }, [pathname, lock, router]);

  // Poll chip jobs
  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      const result = await listActiveCreditPdfImportJobsAction();
      if (cancelled || !result.ok) return;
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
      if (lock) {
        const mine = result.data.find((j) => j.id === lock.jobId);
        if (
          mine &&
          (mine.status === "SUCCEEDED" || mine.status === "FAILED")
        ) {
          releaseLock();
        }
      }
    }
    void refresh();
    const id = window.setInterval(refresh, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [lock, releaseLock]);

  const value = useMemo(
    () => ({
      lock,
      engageLock,
      releaseLock,
      isLocked: Boolean(lock),
    }),
    [lock, engageLock, releaseLock],
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
            <div className="pointer-events-auto rounded-xl bg-ink px-4 py-3 text-sm text-white shadow-lg ring-1 ring-white/10">
              <p className="font-semibold">Analizando PDF…</p>
              <p className="mt-0.5 text-xs text-white/80">
                {runningChip.fileName ?? "reporte.pdf"} · {runningChip.progress}
                %
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
            <div className="pointer-events-auto relative rounded-xl bg-surface-elevated px-4 py-3 pr-10 text-sm text-ink shadow-lg ring-1 ring-border-subtle">
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

      {warnOpen && lock ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="pdf-lock-title"
        >
          <div className="w-full max-w-md rounded-xl bg-surface-elevated p-5 shadow-xl ring-1 ring-border-subtle">
            <h2 id="pdf-lock-title" className="text-lg font-semibold text-ink">
              No puedes salir ahora
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Hay un análisis de PDF en curso
              {lock.fileName ? ` (${lock.fileName})` : ""}. Quédate en la página
              de progreso hasta que termine. Si cierras la pestaña, el navegador
              también te pedirá confirmación.
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                onClick={() => {
                  setWarnOpen(false);
                  router.replace(lock.progressPath);
                }}
              >
                Volver al progreso
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </CreditPdfImportLockContext.Provider>
  );
}
