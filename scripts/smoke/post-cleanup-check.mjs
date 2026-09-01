/** Login programático (fetch) + verificación post-limpieza. */
import { readFileSync } from "node:fs";

const ROOT = new URL("../../", import.meta.url).pathname;
const line = readFileSync(ROOT + ".env.local", "utf8")
  .split("\n")
  .find((l) => l.startsWith("BOOTSTRAP_OWNER_PASSWORD="));
const pw = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");

const base = process.argv[2] ?? "http://localhost:3100";

const r1 = await fetch(`${base}/api/auth/csrf`);
const { csrfToken } = await r1.json();
const cookies = r1.headers.getSetCookie().map((c) => c.split(";")[0]);

const body = new URLSearchParams({
  csrfToken,
  email: "admin@jhmultiservices.com",
  password: pw,
  callbackUrl: `${base}/crm/dashboard`,
});
const r2 = await fetch(`${base}/api/auth/callback/credentials`, {
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookies.join("; ") },
  body,
  redirect: "manual",
});
const setCookies = r2.headers.getSetCookie() ?? [];
console.log("POST login:", r2.status, "->", r2.headers.get("location"));
console.log("cookies establecidas:", setCookies.map((c) => c.split("=")[0]).join(", "));

const all = [...cookies, ...setCookies.map((c) => c.split(";")[0])].join("; ");
const r3 = await fetch(`${base}/crm/dashboard`, { headers: { cookie: all }, redirect: "manual" });
console.log("dashboard con sesión:", r3.status, r3.headers.get("location") ?? "(sin redirect)");
const r4 = await fetch(`${base}/crm/clientes`, { headers: { cookie: all }, redirect: "manual" });
const html = await r4.text();
console.log("clientes con sesión:", r4.status, "| rastros E2E:", (html.match(/E2E-/g) || []).length);
