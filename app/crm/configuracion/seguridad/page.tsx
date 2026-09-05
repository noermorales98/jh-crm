import type { Metadata } from "next";
import { requireOrganization } from "@/src/server/auth/guards";
import { getMfaStatus } from "@/src/server/mfa";
import {
  Card,
  CardBody,
  PageHeader,
  Tabs,
} from "@/src/components/ui";
import { MfaSettingsPanel } from "@/src/components/config/mfa-settings";
import { CONFIG_TABS } from "../config-tabs";

export const metadata: Metadata = {
  title: "Seguridad",
};

export default async function SecuritySettingsPage() {
  const ctx = await requireOrganization();
  const status = await getMfaStatus(ctx.userId);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Seguridad"
        description="Autenticación en dos pasos (MFA/TOTP) para tu cuenta de staff."
      />

      <Tabs items={CONFIG_TABS} />

      <Card>
        <CardBody>
          <MfaSettingsPanel
            initialEnabled={status.mfaEnabled}
            recommended={status.recommended}
          />
        </CardBody>
      </Card>
    </div>
  );
}
