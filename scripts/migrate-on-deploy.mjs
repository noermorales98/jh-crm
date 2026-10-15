/**
 * Corre `prisma migrate deploy` solo cuando está explícitamente permitido.
 *
 * Política QA / sandbox (JH-001 / TEST-007):
 * - Preview, local, CI y builds con QA_SANDBOX=1 NUNCA migran.
 * - Solo Vercel Production (`VERCEL_ENV=production`) migra por defecto.
 * - Override: RUN_PRISMA_MIGRATE=true (y, si QA_SANDBOX=1, también ALLOW_QA_MIGRATE=true).
 *
 * `npm run build:qa` no invoca este script: usa `next build` directo.
 *
 * Requiere DATABASE_URL solo cuando realmente va a migrar.
 */
import { execSync } from "node:child_process";

const vercelEnv = process.env.VERCEL_ENV ?? "";
const nodeEnv = process.env.NODE_ENV ?? "";
const force = process.env.RUN_PRISMA_MIGRATE === "true";
const qaSandbox =
  process.env.QA_SANDBOX === "1" || process.env.QA_SANDBOX === "true";
const allowQaMigrate =
  process.env.ALLOW_QA_MIGRATE === "1" ||
  process.env.ALLOW_QA_MIGRATE === "true";
const isCi = process.env.CI === "true" || process.env.CI === "1";
const isVercelProduction = vercelEnv === "production";

function skip(reason) {
  console.log(`[migrate-on-deploy] skip (${reason})`);
  process.exit(0);
}

// Hard stop: QA sandbox never migrates unless dual-opt-in.
if (qaSandbox && !(force && allowQaMigrate)) {
  skip(
    `QA_SANDBOX set; migrate blocked (ALLOW_QA_MIGRATE+RUN_PRISMA_MIGRATE required to override)`,
  );
}

// CI (GitHub Actions, etc.) never migrates unless forced AND not QA-blocked above.
if (isCi && !isVercelProduction && !force) {
  skip(`CI=${process.env.CI}; VERCEL_ENV=${vercelEnv || "unset"}`);
}

if (!force && !isVercelProduction) {
  skip(
    `VERCEL_ENV=${vercelEnv || "unset"} NODE_ENV=${nodeEnv || "unset"}; solo production o RUN_PRISMA_MIGRATE=true`,
  );
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
