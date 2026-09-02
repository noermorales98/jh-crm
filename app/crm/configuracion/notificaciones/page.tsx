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
import { CONFIG_TABS } from "../config-tabs";

export const metadata: Metadata = {
  title: "Notificaciones",
};

export default async function NotificationsSettingsPage() {
  const ctx = await requireOrganization();

  if (!can(ctx.role, "settings.manage")) {
    return (
      <div>
        <PageHeader
          title="Notificaciones"
          description="Correo SMTP, resumen diario y avisos al equipo."
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
        title="Notificaciones"
        description="Configura el servidor de correo, el resumen diario, qué avisos salen por correo o WhatsApp, y los recordatorios a clientes."
      />

      <Tabs items={CONFIG_TABS} />

      <Card>
        <CardBody>
          <SettingsForm initialValues={settings} section="notifications" />
        </CardBody>
      </Card>
    </div>
  );
}
