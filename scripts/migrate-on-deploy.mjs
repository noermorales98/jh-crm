/**
 * Corre `prisma migrate deploy` solo en builds de Production (Vercel).
 *
 * Preview/dev NO migran (evita que un PR toque la DB de staging/prod por error).
 * Override local/CI: RUN_PRISMA_MIGRATE=true
 *
 * Requiere DATABASE_URL del entorno de build.
 */
import { execSync } from "node:child_process";

const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "";
const force = process.env.RUN_PRISMA_MIGRATE === "true";
const isVercelProduction = process.env.VERCEL_ENV === "production";

if (!force && !isVercelProduction) {
  console.log(
    `[migrate-on-deploy] skip (VERCEL_ENV=${env || "unset"}; solo production o RUN_PRISMA_MIGRATE=true)`,
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[migrate-on-deploy] Falta DATABASE_URL; abortando build.");
  process.exit(1);
}

console.log(
  `[migrate-on-deploy] prisma migrate deploy (${force ? "forced" : "vercel production"})…`,
);
execSync("npx prisma migrate deploy", { stdio: "inherit" });
console.log("[migrate-on-deploy] OK");
