import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { listStages } from "@/src/server/config";
import {
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  Tabs,
} from "@/src/components/ui";
import { StagesManager } from "@/src/components/config/stages-manager";

export const metadata: Metadata = {
  title: "Etapas del proceso",
};

const CONFIG_TABS = [
  { href: "/crm/configuracion", label: "Empresa y folios" },
  { href: "/crm/configuracion/etapas", label: "Etapas del proceso" },
];

export default async function StagesPage() {
  const ctx = await requireOrganization();

  if (!can(ctx.role, "settings.manage")) {
    return (
      <div>
        <PageHeader
          title="Etapas del proceso"
          description="Flujo de trabajo de los casos de reparación de crédito."
        />
        <Card>
          <EmptyState
            icon={ShieldAlert}
            title="Acceso restringido"
            description="Solo el propietario y los administradores pueden modificar la configuración."
          />
        </Card>
      </div>
    );
  }

  const stages = await listStages(ctx, true);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Etapas del proceso"
        description="Orden y colores de las etapas por las que avanza un caso."
      />

      <Tabs items={CONFIG_TABS} />

      <Card>
        <CardBody>
          <StagesManager
            stages={stages.map((s) => ({
              id: s.id,
              key: s.key,
              name: s.name,
              color: s.color,
              isTerminal: s.isTerminal,
              isActive: s.isActive,
            }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
