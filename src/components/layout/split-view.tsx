"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function SplitView({
  list,
  detail,
  selectedId,
  emptyTitle,
  emptyDescription,
}: {
  list: ReactNode;
  detail: ReactNode;
  selectedId: string | null;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function closeSheet() {
    const next = new URLSearchParams(params.toString());
    next.delete("id");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row md:gap-4">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto md:max-w-[26rem] md:shrink-0 md:rounded-surface md:bg-surface-elevated">
        {list}
      </div>
      <div className="hidden min-h-0 min-w-0 flex-1 overflow-y-auto md:block md:rounded-surface md:bg-surface-elevated">
        {selectedId ? (
          detail
        ) : (
          <div className="flex h-full min-h-64 items-center justify-center px-6 text-center">
            <div>
              <p className="text-sm font-semibold text-ink">{emptyTitle}</p>
              <p className="mt-1 text-sm text-text-secondary">{emptyDescription}</p>
            </div>
          </div>
        )}
      </div>
      {selectedId ? (
        <div className="fixed inset-0 z-30 bg-ink/40 md:hidden" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            className="absolute inset-x-0 bottom-0 top-10 overflow-y-auto rounded-t-surface bg-surface-elevated"
          >
            <div className="sticky top-0 z-10 flex justify-end bg-surface-elevated px-3 py-2">
              <button
                type="button"
                onClick={closeSheet}
                className="flex size-9 items-center justify-center rounded-full hover:bg-nav-hover"
                aria-label="Cerrar"
                data-cuelume-press="press"
                data-cuelume-release="release"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            {detail}
          </div>
        </div>
      ) : null}
    </div>
  );
}
