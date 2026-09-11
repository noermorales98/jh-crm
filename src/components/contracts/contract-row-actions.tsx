"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Send } from "lucide-react";
import { Button } from "@/src/components/ui";
import {
  cancelContractAction,
  markContractSentAction,
} from "@/src/actions/contracts";
import { playActionResult } from "@/src/lib/cuelume";

export function ContractRowActions({
  contractId,
  status,
}: {
  contractId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (status !== "DRAFT" && status !== "SENT") return null;

  return (
    <div className="flex items-center justify-end gap-1">
      {status === "DRAFT" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            startTransition(async () => {
              const result = await markContractSentAction(contractId);
              playActionResult(result.ok);
              if (result.ok) router.refresh();
            });
          }}
        >
          <Send className="size-3.5" aria-hidden />
          Enviar
        </Button>
      ) : null}
      {status === "DRAFT" || status === "SENT" ? (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (!confirm("¿Cancelar este contrato?")) return;
            startTransition(async () => {
              const result = await cancelContractAction(contractId);
              playActionResult(result.ok);
              if (result.ok) router.refresh();
            });
          }}
        >
          <Ban className="size-3.5" aria-hidden />
          Cancelar
        </Button>
      ) : null}
    </div>
  );
}
