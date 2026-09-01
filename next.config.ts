import type { NextConfig } from "next";

const crmPrefixes = [
  "dashboard",
  "clientes",
  "casos",
  "rondas",
  "tareas",
  "servicios",
  "cotizaciones",
  "pagos",
  "recibos",
  "usuarios",
  "auditoria",
  "configuracion",
] as const;

const nextConfig: NextConfig = {
  async redirects() {
    return crmPrefixes.flatMap((segment) => [
      {
        source: `/${segment}`,
        destination: `/crm/${segment}`,
        permanent: false,
      },
      {
        source: `/${segment}/:path*`,
        destination: `/crm/${segment}/:path*`,
        permanent: false,
      },
    ]);
  },
};

export default nextConfig;
