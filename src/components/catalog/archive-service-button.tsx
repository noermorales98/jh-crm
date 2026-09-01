"use client";

import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button, ConfirmDialog } from "@/src/components/ui";
import { archiveService } from "@/src/actions/services";

/** Archiva un servicio (isActive=false). No borra el registro. */
export function ArchiveServiceButton({
  serviceId,
  serviceName,
}: {
  serviceId: string;
  serviceName: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Archivar servicio"
      message={
        <>
          El servicio <strong>{serviceName}</strong> dejará de estar disponible
          para nuevos paquetes y cotizaciones. Las cotizaciones históricas no se
          modifican.
        </>
      }
      confirmLabel="Archivar"
      danger
      trigger={
        <Button variant="ghost" size="sm">
          <Archive className="size-3.5" aria-hidden />
          Archivar
        </Button>
      }
      onConfirm={async () => {
        const result = await archiveService(serviceId);
        if (!result.ok) return result.error;
        router.refresh();
      }}
    />
  );
}
