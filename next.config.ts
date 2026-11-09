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
  "mails",
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
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
    ],
  },
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
  // Descubrimiento OAuth del conector MCP de Claude (RFC 8414 / RFC 9728).
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/authorization-server",
      },
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/protected-resource",
      },
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/protected-resource",
      },
    ];
  },
  serverExternalPackages: ["imapflow", "mailparser"],
};

export default nextConfig;
