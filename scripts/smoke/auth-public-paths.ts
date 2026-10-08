/**
 * PR-SEC-01 — política de rutas anónimas (sin DB ni servidor HTTP).
 *
 * Uso: npx tsx scripts/smoke/auth-public-paths.ts
 *      npm run smoke:auth-paths
 */
import { isAnonymousPath } from "../../src/server/auth/public-paths";

function check(label: string, ok: boolean) {
  if (!ok) throw new Error(`FAIL: ${label}`);
  console.log(`  ✓ ${label}`);
}

const mustBePublic: string[] = [
  "/api/webhooks/stripe/org_sintetica",
  "/api/webhooks/stripe",
  "/pay/success",
  "/pay/cancel",
  "/a/token-sintetico",
  "/api/auth/callback/credentials",
  "/api/public/contact",
  "/api/cron/reminders",
  "/api/mails/inbound",
  "/api/health",
  "/intake/abc",
  "/login",
  "/privacy",
  "/portal/login",
];

const mustNotBePublic: string[] = [
  "/api/ai/chat",
  "/api/files/upload-url",
  "/api/crm/search",
  "/crm",
  "/crm/clientes",
  "/portal",
  "/portal/documentos",
  "/api/portal/anything",
  "/pay",
  "/pay/other",
  "/a",
];

console.log("\n[PR-SEC-01] isAnonymousPath");

for (const path of mustBePublic) {
  check(`público: ${path}`, isAnonymousPath(path) === true);
}

for (const path of mustNotBePublic) {
  check(`no público: ${path}`, isAnonymousPath(path) === false);
}

console.log("\nOK auth-public-paths\n");
