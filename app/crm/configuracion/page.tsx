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
import {
  MARCA_SETTINGS_DESCRIPTION,
  MARCA_SETTINGS_TITLE,
} from "@/src/lib/brand/marca";
import { CONFIG_TABS } from "./config-tabs";

export const metadata: Metadata = {
  title: MARCA_SETTINGS_TITLE,
};

export default async function SettingsPage() {
  const ctx = await requireOrganization();

  if (!can(ctx.role, "settings.manage")) {
    return (
      <div>
        <PageHeader
          title={MARCA_SETTINGS_TITLE}
          description={MARCA_SETTINGS_DESCRIPTION}
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
        title={MARCA_SETTINGS_TITLE}
        description={MARCA_SETTINGS_DESCRIPTION}
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
