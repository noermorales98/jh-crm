import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import { getSettingsFormValues } from "@/src/server/config";
import {
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  PageHeader,
  Tabs,
} from "@/src/components/ui";
import { SettingsForm } from "@/src/components/config/settings-form";
import { BrandContactForm } from "@/src/components/config/brand-contact-form";
import { getBrandContact } from "@/src/server/config/brand-contact";
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

  const [settings, brandContact] = await Promise.all([
    getSettingsFormValues(ctx),
    getBrandContact(ctx.organizationId),
  ]);

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

      <Card className="mt-6">
        <CardHeader
          title="Contacto y firma para clientes"
          description="WhatsApp, link de agenda y la firma que va en tus contratos."
        />
        <CardBody>
          <BrandContactForm initial={brandContact} />
        </CardBody>
      </Card>
    </div>
  );
}
