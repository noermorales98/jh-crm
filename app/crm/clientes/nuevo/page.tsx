import type { Metadata } from "next";
import { requirePermission } from "@/src/server/auth/guards";
import { listMemberOptions } from "@/src/server/page-helpers";
import { Card, CardBody, PageHeader } from "@/src/components/ui";
import { ClientForm } from "@/src/components/clients/client-form";

export const metadata: Metadata = {
  title: "Nuevo cliente",
};

export default async function NewClientPage() {
  const ctx = await requirePermission("clients.create");
  const members = await listMemberOptions(ctx);

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nuevo cliente"
        description="Alta manual de un cliente o prospecto. Los datos sensibles (SSN, licencia) se capturan después en el expediente."
      />
      <Card>
        <CardBody>
          <ClientForm mode="create" members={members} />
        </CardBody>
      </Card>
    </div>
  );
}
