import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getSettingsFormValues } from "@/src/server/config";
import {
  Card,
  CardBody,
  EmptyState,
  PageHeader,
  Tabs,
} from "@/src/components/ui";
import { SettingsForm } from "@/src/components/config/settings-form";
import { CONFIG_TABS } from "./config-tabs";

export const metadata: Metadata = {
  title: "Configuración",
};

export default async function SettingsPage() {
  const ctx = await requireOrganization();

  if (!can(ctx.role, "settings.manage")) {
    return (
      <div>
        <PageHeader
          title="Configuración"
          description="Datos de la empresa, moneda, impuestos y folios."
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

  const settings = await getSettingsFormValues(ctx);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Configuración"
        description="Datos de la empresa, moneda, impuestos, folios y términos. El correo y WhatsApp están en la pestaña Notificaciones."
      />

      <Tabs items={CONFIG_TABS} />

      <Card>
        <CardBody>
          <SettingsForm initialValues={settings} section="company" />
        </CardBody>
      </Card>
    </div>
  );
}
