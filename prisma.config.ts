import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js usa .env.local; el CLI de Prisma solo carga .env por defecto.
loadEnvLocal({ path: ".env.local", override: true });

// Permite apuntar migraciones a otra DB sin editar .env.local
// (p. ej. producción): MIGRATE_DATABASE_URL=mysql://...
if (process.env.MIGRATE_DATABASE_URL?.trim()) {
  process.env.DATABASE_URL = process.env.MIGRATE_DATABASE_URL.trim();
}

export default defineConfig({
  schema: "prisma/schema.prisma",
});
