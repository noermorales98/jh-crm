"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { getPortalDocumentDownloadUrlAction } from "@/src/actions/portal";

export function PortalDownloadLink({
  documentId,
  label,
}: {
  documentId: string;
  label: string;
}) {
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    try {
      const result = await getPortalDocumentDownloadUrlAction(documentId);
      if (result.ok) {
        window.open(result.data.url, "_blank", "noopener,noreferrer");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className="inline-flex items-center gap-1 text-sm font-medium text-action-primary hover:underline disabled:opacity-60"
    >
      <Download className="size-3.5" aria-hidden />
      {busy ? "…" : label}
    </button>
  );
}
