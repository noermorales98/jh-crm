/**
 * TEST-007 — baseline QA: migrate-on-deploy no corre en sandbox/CI.
 *
 * Uso: npx tsx scripts/smoke/qa-baseline.ts
 *      npm run smoke:qa-baseline
 *
 * Sin DB. Sin secretos productivos.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const script = join(process.cwd(), "scripts/migrate-on-deploy.mjs");

type SmokeEnv = Record<string, string | undefined>;

function run(
  label: string,
  env: SmokeEnv,
  expectExit: number,
  expectStdoutIncludes: string,
) {
  let stdout = "";
  let stderr = "";
  let code = 0;
  try {
    stdout = execFileSync(process.execPath, [script], {
      env: { ...process.env, ...env, DATABASE_URL: env.DATABASE_URL ?? "" },
      encoding: "utf8",
    });
  } catch (e) {
    const err = e as {
      status?: number;
      stdout?: string;
      stderr?: string;
      message?: string;
    };
    code = typeof err.status === "number" ? err.status : 1;
    stdout = String(err.stdout ?? "");
    stderr = String(err.stderr ?? err.message ?? "");
  }

  const combined = `${stdout}\n${stderr}`;
  if (code !== expectExit) {
    throw new Error(
      `FAIL ${label}: exit ${code} (expected ${expectExit})\n${combined}`,
    );
  }
  if (!combined.includes(expectStdoutIncludes)) {
    throw new Error(
      `FAIL ${label}: missing "${expectStdoutIncludes}"\n${combined}`,
    );
  }
  console.log(`  ✓ ${label}`);
}

console.log("\n[TEST-007] migrate-on-deploy QA baseline");

const base: SmokeEnv = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  // Clear production triggers from the parent shell.
  VERCEL_ENV: "",
  NODE_ENV: "test",
  CI: "",
  QA_SANDBOX: "",
  RUN_PRISMA_MIGRATE: "",
  ALLOW_QA_MIGRATE: "",
  DATABASE_URL: "",
};

run("skip por defecto (no production)", { ...base }, 0, "skip");

run(
  "skip con NODE_ENV=production sin VERCEL_ENV",
  { ...base, NODE_ENV: "production" },
  0,
  "skip",
);

run(
  "skip en CI sin force",
  { ...base, CI: "true", NODE_ENV: "production" },
  0,
  "skip",
);

run(
  "skip con QA_SANDBOX=1 aunque RUN_PRISMA_MIGRATE=true",
  {
    ...base,
    QA_SANDBOX: "1",
    RUN_PRISMA_MIGRATE: "true",
    DATABASE_URL: "mysql://qa:qa@127.0.0.1:3306/qa",
  },
  0,
  "QA_SANDBOX",
);

run(
  "skip en CI aunque VERCEL_ENV vacío y force ausente",
  { ...base, CI: "1", VERCEL_ENV: "preview" },
  0,
  "skip",
);

console.log("\nOK qa-baseline (TEST-007)\n");
