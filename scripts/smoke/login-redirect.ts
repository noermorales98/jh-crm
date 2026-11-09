/**
 * Adónde vuelve el equipo tras iniciar sesión (sin BD). Solo rutas internas del CRM y
 * la pantalla de consentimiento del conector de Claude; nunca un sitio externo.
 *
 *   npx tsx scripts/smoke/login-redirect.ts
 */
import { safeLoginRedirect } from "../../src/lib/routes/login-redirect";

const ORIGIN = "https://crm.example.test";
const DASH = "/crm/dashboard";
let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

function expect(raw: string | null, want: string) {
  const got = safeLoginRedirect(raw, ORIGIN);
  check(`${JSON.stringify(raw)} → ${want}`, got === want, got);
}

console.log("\n[login-redirect] vuelta tras iniciar sesión\n");
const authorize = "/oauth/authorize?client_id=abc&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcb&state=x";
expect(null, DASH);
expect("", DASH);
expect("/crm/clientes?x=1", "/crm/clientes?x=1");
expect(`${ORIGIN}/crm/tareas`, "/crm/tareas");
expect(authorize, authorize);
expect(`${ORIGIN}${authorize}`, authorize);
expect("/oauth/authorize", "/oauth/authorize");
// Rechazos
expect("/oauth/authorizeX", DASH);
expect("/oauth/token", DASH);
expect("/portal", DASH);
expect("//evil.com/crm", DASH);
expect("https://evil.com/crm/clientes", DASH);
expect(`https://evil.com${authorize}`, DASH);
expect("javascript:alert(1)", DASH);
expect("/\\evil.com", DASH);
expect("/credit", DASH);
expect("/portal/crm", DASH);
expect("/crm/../portal", DASH);
expect("http://[", DASH);

if (failed > 0) {
  console.error(`\n✗ ${failed} comprobación(es) fallaron\n`);
  process.exit(1);
}
console.log("\n✓ login-redirect OK\n");
