/**
 * Núcleo OAuth del conector MCP (sin BD): PKCE S256, lista cerrada de redirect_uri y
 * tokens opacos guardados solo como hash. AC-1, AC-14.
 *
 *   npm run smoke:mcp-oauth-core
 */
import {
  hashToken,
  isAllowedRedirectUri,
  newOpaqueToken,
  verifyPkce,
} from "../../src/server/mcp/oauth/core";

let failed = 0;

function check(label: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failed += 1;
    console.error(`  ✗ ${label}`, detail ?? "");
  }
}

console.log("\n[mcp-oauth-core] PKCE\n");
// Vector oficial de RFC 7636, apéndice B.
const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const challenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";
check("S256 con el vector de RFC 7636 → válido", verifyPkce(verifier, challenge, "S256"));
check("S256 con otro verifier → inválido", !verifyPkce(`${verifier.slice(0, -1)}A`, challenge, "S256"));
check("método plain → rechazado aunque coincida", !verifyPkce(challenge, challenge, "plain"));
check("método vacío → rechazado", !verifyPkce(verifier, challenge, ""));
check("verifier corto (< 43) → rechazado", !verifyPkce("abc", challenge, "S256"));
check("verifier largo (> 128) → rechazado", !verifyPkce("a".repeat(129), challenge, "S256"));
check(
  "verifier con caracteres no permitidos → rechazado",
  !verifyPkce(`${verifier.slice(0, 42)}+`, challenge, "S256"),
);
check("challenge vacío → rechazado", !verifyPkce(verifier, "", "S256"));

console.log("\n[mcp-oauth-core] redirect_uri\n");
const allowed = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
  "http://localhost:6274/oauth/callback",
  "http://127.0.0.1:33418/callback",
];
for (const uri of allowed) check(`permitida: ${uri}`, isAllowedRedirectUri(uri));
const rejected = [
  "https://evil.com/callback",
  "https://claude.ai.evil.com/callback",
  "https://evil.com/https://claude.ai/",
  "https://claude.ai@evil.com/callback",
  "https://user:pw@claude.ai/callback",
  "http://claude.ai/api/mcp/auth_callback",
  "https://sub.claude.ai/callback",
  "https://claude.ai:8443/callback",
  "https://claude.ai/callback#frag",
  "http://localhost/callback",
  "http://localhost.evil.com:6274/callback",
  "https://localhost:6274/callback",
  "javascript:alert(1)",
  "claude.ai/callback",
  "",
  `https://claude.ai/${"a".repeat(2100)}`,
];
for (const uri of rejected) check(`rechazada: ${uri.slice(0, 60)}`, !isAllowedRedirectUri(uri));

console.log("\n[mcp-oauth-core] tokens\n");
const a = newOpaqueToken();
const b = newOpaqueToken();
check("token opaco de ≥ 43 caracteres (32 bytes base64url)", a.length >= 43, a.length);
check("token solo base64url", /^[A-Za-z0-9_-]+$/.test(a));
check("dos tokens distintos", a !== b);
const h = hashToken(a);
check("hash es SHA-256 en hex (64)", /^[0-9a-f]{64}$/.test(h), h);
check("hash distinto del token", h !== a);
check("hash determinista", hashToken(a) === h);
check(
  "hash de un valor conocido",
  hashToken("abc") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
);

if (failed > 0) {
  console.error(`\n✗ ${failed} comprobación(es) fallaron\n`);
  process.exit(1);
}
console.log("\n✓ mcp-oauth-core OK\n");
