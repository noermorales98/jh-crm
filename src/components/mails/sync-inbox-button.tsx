"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/src/components/ui";
import { syncInbox } from "@/src/actions/mails";
import { playActionResult } from "@/src/lib/cuelume";

export function SyncInboxButton({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  if (!enabled) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          setOk(null);
          startTransition(async () => {
            const result = await syncInbox();
            playActionResult(result.ok);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setOk(
              result.data.created === 0
                ? `Sincronizado (${result.data.fetched} revisados).`
                : `Se importaron ${result.data.created} correos.`,
            );
            router.refresh();
          });
        }}
      >
        <RefreshCw className={`size-4 ${pending ? "animate-spin" : ""}`} aria-hidden />
        {pending ? "Sincronizando…" : "Sincronizar"}
      </Button>
      {error ? (
        <p className="max-w-xs text-right text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : ok ? (
        <p className="text-xs text-text-secondary">{ok}</p>
      ) : null}
    </div>
  );
}
