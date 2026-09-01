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
  "chats",
  "usuarios",
  "auditoria",
  "configuracion",
] as const;

function serverActionOrigins(): string[] {
  const hosts = new Set<string>();
  for (const raw of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.AUTH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : undefined,
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined,
  ]) {
    if (!raw) continue;
    try {
      hosts.add(new URL(raw).host);
    } catch {
      // Ignorar valores que no sean URL.
    }
  }
  return [...hosts];
}

const actionOrigins = serverActionOrigins();

const nextConfig: NextConfig = {
  ...(actionOrigins.length > 0
    ? {
        experimental: {
          serverActions: {
            allowedOrigins: actionOrigins,
          },
        },
      }
    : {}),
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
