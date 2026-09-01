import "dotenv/config";
import { config as loadEnvLocal } from "dotenv";
import { defineConfig } from "prisma/config";

// Next.js usa .env.local; el CLI de Prisma solo carga .env por defecto.
loadEnvLocal({ path: ".env.local", override: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
});
