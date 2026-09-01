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
import { PackageFormButton } from "@/src/components/catalog/package-form-button";
import { ArchivePackageButton } from "@/src/components/catalog/archive-package-button";

export const metadata: Metadata = {
  title: "Paquetes de servicios",
};

const CATALOG_TABS = [
  { href: "/crm/servicios", label: "Servicios" },
  { href: "/crm/servicios/paquetes", label: "Paquetes" },
];

export default async function PackagesPage() {
  const ctx = await requireOrganization();
  const canManage = can(ctx.role, "catalog.manage");

  const [packages, services] = await Promise.all([
    catalog.listPackages(ctx, true),
    // Solo servicios activos: el backend exige que los ítems del paquete estén activos.
    catalog.listServices(ctx, false),
  ]);

  const serviceOptions = services.map((s) => ({
    id: s.id,
    name: s.name,
    defaultPrice: Number(s.defaultPrice.toString()),
  }));

  return (
    <div>
      <PageHeader
        title="Paquetes de servicios"
        description="Agrupaciones de servicios con precio de paquete para cotizaciones."
        actions={
          canManage ? (
            <PackageFormButton mode="create" services={serviceOptions} />
          ) : null
        }
      />

      <Tabs items={CATALOG_TABS} />

      <Card>
        {packages.length === 0 ? (
          <EmptyState
            icon={Package}
            title="Sin paquetes"
            description="Crea un paquete para ofrecer varios servicios con un solo precio."
            action={
              canManage ? (
                <PackageFormButton mode="create" services={serviceOptions} />
              ) : null
            }
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Nombre</TH>
                <TH>Servicios incluidos</TH>
                <TH>Precio</TH>
                <TH>Estado</TH>
                {canManage ? <TH>Acciones</TH> : null}
              </TR>
            </THead>
            <TBody>
              {packages.map((pkg) => (
                <TR key={pkg.id} className="transition-colors hover:bg-nav-hover">
                  <TD>
                    <span className="font-medium text-ink">{pkg.name}</span>
                    {pkg.description ? (
                      <span className="block text-xs text-text-secondary">
                        {pkg.description}
                      </span>
                    ) : null}
                  </TD>
                  <TD>
                    <ul className="space-y-0.5 text-xs text-text-secondary-strong">
                      {pkg.items.map((item) => (
                        <li key={item.id}>
                          {item.quantity} × {item.service.name}
                        </li>
                      ))}
                    </ul>
                  </TD>
                  <TD className="whitespace-nowrap tabular-nums">
                    {formatMoney(pkg.defaultPrice, pkg.currency)}
                  </TD>
                  <TD>
                    {pkg.isActive ? (
                      <Pill tone="green">Activo</Pill>
                    ) : (
                      <Pill tone="slate">Archivado</Pill>
                    )}
                  </TD>
                  {canManage ? (
                    <TD className="whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <PackageFormButton
                          mode="edit"
                          packageId={pkg.id}
                          services={serviceOptions}
                          initialValues={{
                            name: pkg.name,
                            description: pkg.description ?? "",
                            defaultPrice: pkg.defaultPrice.toString(),
                            items: pkg.items.map((item) => ({
                              serviceId: item.service.id,
                              quantity: String(item.quantity),
                            })),
                          }}
                        />
                        {pkg.isActive ? (
                          <ArchivePackageButton
                            packageId={pkg.id}
                            packageName={pkg.name}
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
