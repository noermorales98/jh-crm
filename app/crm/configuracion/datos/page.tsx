import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getWipePreview } from "@/src/server/config/wipe-org-data";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Tabs,
} from "@/src/components/ui";
import { WipeOrgDataPanel } from "@/src/components/config/wipe-org-data-panel";
import { CONFIG_TABS } from "../config-tabs";

export const metadata: Metadata = {
  title: "Borrar datos",
};

export default async function WipeDataPage() {
  const ctx = await requireOrganization();

  if (!can(ctx.role, "settings.manage")) {
    return (
      <div>
        <PageHeader
          title="Borrar datos"
          description="Eliminar el contenido operativo de la organización."
        />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Acceso restringido"
            description="Solo el propietario y los administradores pueden borrar el contenido."
          />
        </Card>
      </div>
    );
  }

  const counts = await getWipePreview(ctx);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Borrar datos"
        description="Zona exclusiva de propietario y administrador. Vacía clientes, leads y el resto de datos operativos sin tocar usuarios ni la configuración."
      />

      <Tabs items={CONFIG_TABS} />

      <Card className="border-danger/30">
        <CardHeader
          title="Borrar todo el contenido"
          description="Pensado para entornos de desarrollo o para empezar de cero. Irreversible."
        />
        <CardBody>
          <WipeOrgDataPanel initialCounts={counts} />
        </CardBody>
      </Card>
    </div>
  );
}
