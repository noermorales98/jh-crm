/**
 * Smoke SPRINT 8 — páginas legales + validación de contacto (privacidad).
 *
 *   npm run smoke:sprint8
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { contactFormSchema } from "../../src/lib/validation/contact";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${label}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

const LEGAL_SLUGS = [
  "privacy",
  "terms",
  "cancellation",
  "refunds",
  "disclosures",
  "sms-terms",
] as const;

const basePayload = {
  name: "María Demo",
  email: "maria.demo@example.com",
  phone: "(872) 555-0100",
  message: "Consulta de prueba para smoke sprint 8.",
  challengeToken: "1|2",
  challengeAnswer: "3",
  website: "",
};

async function main() {
  console.log("\n[1] Páginas legales (existencia de rutas App Router)");
  const root = process.cwd();
  for (const slug of LEGAL_SLUGS) {
    const pagePath = join(root, "app/(marketing)", slug, "page.tsx");
    check(`ruta /${slug} → ${pagePath}`, existsSync(pagePath));
  }

  console.log("\n[2] contactFormSchema — privacyAccepted requerido");
  const withoutPrivacy = contactFormSchema.safeParse({
    ...basePayload,
    smsConsent: false,
  });
  check("rechaza sin privacyAccepted", !withoutPrivacy.success);

  const privacyFalse = contactFormSchema.safeParse({
    ...basePayload,
    privacyAccepted: false,
    smsConsent: false,
  });
  check("rechaza privacyAccepted=false", !privacyFalse.success);
  if (!privacyFalse.success) {
    const msg = privacyFalse.error.issues.map((i) => i.message).join(" ");
    check(
      "mensaje de privacidad en español",
      /privacidad/i.test(msg),
      msg,
    );
  }

  const okNoSms = contactFormSchema.safeParse({
    ...basePayload,
    privacyAccepted: true,
    smsConsent: false,
  });
  check("acepta con privacyAccepted=true (sin SMS)", okNoSms.success);

  const okSms = contactFormSchema.safeParse({
    ...basePayload,
    privacyAccepted: true,
    smsConsent: true,
  });
  check("acepta privacy + smsConsent", okSms.success);
  check(
    "smsConsent true en parse",
    okSms.success && okSms.data.smsConsent === true,
  );

  const omitSms = contactFormSchema.safeParse({
    ...basePayload,
    privacyAccepted: true,
  });
  check(
    "smsConsent opcional (default false)",
    omitSms.success && omitSms.data.smsConsent === false,
  );

  console.log("\n[3] Auth whitelist (auth.config.ts menciona rutas legales)");
  const authConfigPath = join(root, "auth.config.ts");
  check("auth.config.ts existe", existsSync(authConfigPath));
  if (existsSync(authConfigPath)) {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(authConfigPath, "utf8");
    for (const slug of LEGAL_SLUGS) {
      check(`auth permite /${slug}`, src.includes(`"/${slug}"`));
    }
  }

  console.log(`\nResultado: ${passed} ok, ${failed} fallos`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
