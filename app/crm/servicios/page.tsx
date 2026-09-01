import type { Metadata } from "next";
import { Package } from "lucide-react";
import { requireOrganization } from "@/src/server/auth/guards";
import { can } from "@/src/server/auth/permissions";
import * as catalog from "@/src/server/services";
import {
  Card,
  EmptyState,
  PageHeader,
  Pill,
  Table,
  Tabs,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/src/components/ui";
import { formatMoney } from "@/src/lib/format";
import { ServiceFormButton } from "@/src/components/catalog/service-form-button";
import { ArchiveServiceButton } from "@/src/components/catalog/archive-service-button";

export const metadata: Metadata = {
  title: "Servicios",
};

const CATALOG_TABS = [
  { href: "/crm/servicios", label: "Servicios" },
  { href: "/crm/servicios/paquetes", label: "Paquetes" },
];

export default async function ServicesPage() {
  const ctx = await requireOrganization();
  const canManage = can(ctx.role, "catalog.manage");
  const services = await catalog.listServices(ctx, true);

  return (
    <div>
      <PageHeader
        title="Catálogo de servicios"
        description="Servicios individuales que se ofrecen en cotizaciones y paquetes."
        actions={canManage ? <ServiceFormButton mode="create" /> : null}
      />

      <Tabs items={CATALOG_TABS} />

      <Card>
        {services.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin servicios"
            description="Crea el primer servicio del catálogo para usarlo en cotizaciones y paquetes."
            action={canManage ? <ServiceFormButton mode="create" /> : null}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Descripción</TH>
                <TH>Precio</TH>
                <TH>Estado</TH>
                {canManage ? <TH>Acciones</TH> : null}
              </TR>
            </THead>
            <TBody>
              {services.map((service) => (
                <TR key={service.id} className="transition-colors hover:bg-nav-hover">
                  <TD className="font-medium text-ink">{service.name}</TD>
                  <TD className="max-w-md">
                    {service.description ? (
                      <span className="line-clamp-2 text-xs text-text-secondary">
                        {service.description}
                      </span>
                    ) : (
                      <span className="text-text-secondary">—</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums">
                    {formatMoney(service.defaultPrice, service.currency)}
                  </TD>
                  <TD>
                    {service.isActive ? (
                      <Pill tone="green">Activo</Pill>
                    ) : (
                      <Pill tone="slate">Archivado</Pill>
                    )}
                  </TD>
                  {canManage ? (
                    <TD className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <ServiceFormButton
                          mode="edit"
                          serviceId={service.id}
                          initialValues={{
                            name: service.name,
                            description: service.description ?? "",
                            defaultPrice: service.defaultPrice.toString(),
                          }}
                        />
                        {service.isActive ? (
                          <ArchiveServiceButton
                            serviceId={service.id}
                            serviceName={service.name}
                          />
                        ) : null}
                      </div>
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
