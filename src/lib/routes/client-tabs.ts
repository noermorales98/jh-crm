/** Pestañas de la ficha del cliente (Fase 1: 6 pestañas). */
export function clientTabs(clientId: string) {
  const base = `/crm/clientes/${clientId}`;
  return [
    { href: base, label: "Resumen" },
    { href: `${base}/servicios`, label: "Servicios" },
    { href: `${base}/reportes`, label: "Reportes" },
    { href: `${base}/actividad`, label: "Actividad" },
    { href: `${base}/tareas`, label: "Tareas" },
    { href: `${base}/expediente`, label: "Expediente" },
    { href: `${base}/pagos`, label: "Pagos" },
  ];
}
