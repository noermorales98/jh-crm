"use client";

import { useEffect, useState } from "react";
import { loadEmbeddedLetterDetail } from "@/src/actions/embedded-round";
import type { EmbeddedLetterDetail } from "@/src/server/rounds/embedded-detail";
import { LetterHtmlView } from "@/src/components/letters/letter-html-view";
import { LetterActions } from "@/src/components/letters/letter-actions";
import { subscribeEmbedRefresh } from "@/src/lib/embed-refresh";

export function EmbeddedLetterPanel({
  letterId,
  onBack,
}: {
  letterId: string;
  onBack: () => void;
}) {
  const [data, setData] = useState<EmbeddedLetterDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadEmbeddedLetterDetail({ letterId }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (!res.ok) {
        setError(res.error);
        setData(null);
        return;
      }
      setData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [letterId, reloadKey]);

  useEffect(() => {
    return subscribeEmbedRefresh(() => setReloadKey((k) => k + 1));
  }, []);

  if (loading && !data) {
    return (
      <p className="py-6 text-center text-[13px] text-text-secondary">
        Cargando carta…
      </p>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-action-primary"
        >
          ← Volver a la ronda
        </button>
        <p className="text-center text-sm text-danger">
          {error ?? "No se pudo cargar la carta"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.canManage ? (
        <div className="flex justify-end">
          <LetterActions
            letterId={data.id}
            status={data.status}
            caseId={data.caseId}
            roundId={data.roundId}
            onChanged={() => setReloadKey((k) => k + 1)}
          />
        </div>
      ) : null}
      <LetterHtmlView
        organizationName={data.organizationName}
        organizationContact={data.organizationContact}
        recipient={data.recipient}
        subject={data.subjectSnapshot}
        body={data.contentSnapshot}
        issuedAt={data.finalizedAt ?? data.generatedAt}
        timezone={data.timezone}
        folio={data.folio}
        caseId={data.caseId}
        roundId={data.roundId}
        downloadHref={`/api/letters/${data.id}/pdf`}
        backHref="#"
        onBack={onBack}
      />
    </div>
  );
}
