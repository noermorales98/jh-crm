"use client";

import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button, ConfirmDialog } from "@/src/components/ui";
import { archivePackage } from "@/src/actions/services";

/** Archiva un paquete (isActive=false). No borra el registro. */
export function ArchivePackageButton({
  packageId,
  packageName,
}: {
  packageId: string;
  packageName: string;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Archivar paquete"
      message={
        <>
          El paquete <strong>{packageName}</strong> dejará de estar disponible
          para nuevas cotizaciones. Las cotizaciones históricas no se modifican.
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
        const result = await archivePackage(packageId);
        if (!result.ok) return result.error;
        router.refresh();
      }}
    />
  );
}
