/**
 * Verificación integral en navegador real (Chrome headless del sistema vía
 * puppeteer-core). Hace login por la UI, recorre todas las rutas del CRM,
 * captura errores de consola/runtime, verifica contenido E2E y descarga PDFs.
 *
 * Uso: node scripts/smoke/browser-verify.mjs <baseUrl>
 * Requiere .env.local (BOOTSTRAP_OWNER_PASSWORD) y que los datos E2E- existan.
 */
import puppeteer from "puppeteer-core";
import { readFileSync, writeFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";

// Credenciales desde .env.local sin imprimirlas (path robusto al script)
const env = Object.fromEntries(
  readFileSync(new URL("../../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);
const EMAIL = env.BOOTSTRAP_OWNER_EMAIL ?? "admin@jhmultiservices.com";
const PASSWORD = env.BOOTSTRAP_OWNER_PASSWORD;

// IDs del fixture E2E (generados por e2e-flow.ts en e2e-ids.json)
const E2E = JSON.parse(
  readFileSync(new URL("./e2e-ids.json", import.meta.url), "utf8"),
);

const results = [];
const consoleErrors = [];

function check(name, cond, extra = "") {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? ` — ${extra}` : ""}`);
}

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on("console", (msg) => {
  if (msg.type() === "error") consoleErrors.push(`[console] ${page.url()} :: ${msg.text()}`);
});
page.on("pageerror", (err) => {
  consoleErrors.push(`[pageerror] ${page.url()} :: ${err.message}`);
});

// --- Login por la UI ---
await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
check("login: formulario presente", await page.$('input[name="email"]'));
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => null),
  page.click('button[type="submit"]'),
]);
// Las server actions pueden no disparar navegación clásica; esperar redirect
await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => null);
check("login: redirige fuera de /login", !page.url().includes("/login"), page.url());

// --- Recorrido de rutas ---
const routes = [
  ["/crm/dashboard", ["E2E"]],
  ["/crm/clientes", ["E2E-Verificacion"]],
  ["/crm/clientes/nuevo", []],
  [`/crm/clientes/${E2E.clientId}`, ["E2E-Verificacion", E2E.clientCode]],
  ["/crm/casos", [E2E.caseCode]],
  [`/crm/casos/${E2E.caseId}`, [E2E.caseCode, E2E.movedStage]],
  [`/crm/casos/${E2E.caseId}/rondas`, []],
  [`/crm/casos/${E2E.caseId}/tareas`, []],
  [`/crm/casos/${E2E.caseId}/cotizaciones`, []],
  [`/crm/casos/${E2E.caseId}/pagos`, []],
  [`/crm/casos/${E2E.caseId}/documentos`, []],
  ["/crm/rondas", []],
  ["/crm/tareas", ["Revisar actualización de la ronda 1"]],
  ["/crm/servicios", ["E2E-Servicio Verificación"]],
  ["/crm/servicios/paquetes", ["E2E-Paquete Verificación"]],
  ["/crm/cotizaciones", [E2E.quoteFolio]],
  ["/crm/cotizaciones/nueva", []],
  [`/crm/cotizaciones/${E2E.quoteId}`, [E2E.quoteFolio, "PAID", "E2E-Ítem manual"]],
  ["/crm/pagos", ["E2E-PAGO-PARCIAL"]],
  ["/crm/pagos/nuevo", []],
  ["/crm/recibos", [E2E.receipt1Folio, E2E.receipt2Folio]],
  ["/crm/usuarios", []],
  ["/crm/auditoria", ["PAYMENT_RECEIVED", "RECEIPT_VOIDED"]],
  ["/crm/configuracion", []],
  ["/crm/configuracion/etapas", [E2E.movedStage]],
];

let sidebarOk = true;
for (const [path, needles] of routes) {
  let resp = null;
  try {
    resp = await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    // dar tiempo a los RSC/hidratación sin exigir networkidle0
    await new Promise((r) => setTimeout(r, 1200));
  } catch (e) {
    check(`ruta ${path}`, false, `timeout/error de navegación: ${e.message}`);
    continue;
  }
  const status = resp?.status() ?? 0;
  const html = await page.content();
  const missing = needles.filter((n) => !html.includes(n));
  const hasMain = await page.$("main, [role=main], body");
  check(
    `ruta ${path}`,
    status === 200 && missing.length === 0 && hasMain,
    missing.length ? `faltan: ${missing.join(", ")}` : `HTTP ${status}`,
  );
  if (path === "/crm/dashboard") {
    sidebarOk = (await page.$("nav, aside, header")) !== null;
  }
}
check("dashboard: sidebar/navegación presente", sidebarOk);

// --- PDFs (magic %PDF-) ---
async function fetchPdf(path) {
  const cookies = await page.cookies();
  const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const resp = await fetch(`${base}${path}`, { headers: { cookie: cookieHeader } });
  const buf = Buffer.from(await resp.arrayBuffer());
  return { status: resp.status, magic: buf.subarray(0, 5).toString("latin1"), size: buf.length, buf };
}
const pdfQ = await fetchPdf(`/api/quotes/${E2E.quoteId}/pdf`);
check("PDF cotización", pdfQ.status === 200 && pdfQ.magic === "%PDF-", `HTTP ${pdfQ.status}, ${pdfQ.size} bytes`);
if (pdfQ.magic === "%PDF-") writeFileSync(new URL("./e2e-quote.pdf", import.meta.url), pdfQ.buf);
const pdfR1 = await fetchPdf(`/api/receipts/${E2E.receipt1Id}/pdf`);
check("PDF recibo 1 (ISSUED)", pdfR1.status === 200 && pdfR1.magic === "%PDF-", `HTTP ${pdfR1.status}, ${pdfR1.size} bytes`);
if (pdfR1.magic === "%PDF-") writeFileSync(new URL("./e2e-receipt1.pdf", import.meta.url), pdfR1.buf);

// Recibo VOID: el PDF puede estar bloqueado o marcado; aceptamos 200 con %PDF- o respuesta controlada
const pdfR2 = await fetchPdf(`/api/receipts/${E2E.receipt2Id}/pdf`);
check(
  "PDF recibo 2 (VOID) respuesta controlada",
  (pdfR2.status === 200 && pdfR2.magic === "%PDF-") || pdfR2.status === 400 || pdfR2.status === 409,
  `HTTP ${pdfR2.status}, magic=${JSON.stringify(pdfR2.magic)}`,
);

// --- Navegación sidebar: click a "Clientes" desde dashboard ---
await page.goto(`${base}/crm/dashboard`, { waitUntil: "networkidle0" });
const link = await page.$('a[href="/crm/clientes"]');
check("sidebar: enlace a /clientes existe", !!link);
if (link) {
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => null),
    link.click(),
  ]);
  await page.waitForFunction(() => location.pathname.startsWith("/crm/clientes"), { timeout: 10000 }).catch(() => null);
  check("sidebar: navegación a /clientes funciona", page.url().includes("/crm/clientes"), page.url());
}

await browser.close();

console.log("\n=== Errores de consola/runtime ===");
if (consoleErrors.length === 0) {
  console.log("(ninguno)");
} else {
  for (const e of consoleErrors) console.log(e);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n=== Resumen: ${results.length - failed.length}/${results.length} PASS ===`);
writeFileSync(new URL("./browser-verify-results.json", import.meta.url), JSON.stringify({ results, consoleErrors }, null, 2));
process.exit(failed.length || consoleErrors.length ? 1 : 0);
