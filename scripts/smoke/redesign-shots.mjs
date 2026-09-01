/**
 * Capturas del rediseño visual: login por UI y screenshots de rutas clave.
 * Uso: node scripts/smoke/redesign-shots.mjs <baseUrl> <outDir>
 */
import puppeteer from "puppeteer-core";
import { readFileSync, mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3111";
const outDir = new URL(process.argv[3] ?? "../../docs/redesign/", import.meta.url);
mkdirSync(outDir, { recursive: true });

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

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

const shot = async (name) => {
  await page.screenshot({ path: new URL(`${name}.png`, outDir).pathname });
  console.log(`shot: ${name}`);
};

// Login (captura la pantalla antes de entrar)
await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
await shot("01-login");
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => null),
  page.click('button[type="submit"]'),
]);
await page
  .waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 15000 })
  .catch(() => null);

const routes = [
  ["dashboard", "/crm/dashboard"],
  ["clientes", "/crm/clientes"],
  ["casos", "/crm/casos"],
  ["cotizaciones", "/crm/cotizaciones"],
  ["pagos", "/crm/pagos"],
  ["tareas", "/crm/tareas"],
  ["configuracion", "/crm/configuracion"],
];
for (const [name, path] of routes) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 600));
  await shot(`02-${name}`);
}

// Detalle de caso si existe enlace
await page.goto(`${base}/crm/casos`, { waitUntil: "networkidle0" });
const caseLink = await page.$('main a[href^="/crm/casos/"]');
if (caseLink) {
  const href = await page.evaluate((a) => a.getAttribute("href"), caseLink);
  await page.goto(`${base}${href}`, { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 600));
  await shot("03-caso-detalle");
}

await browser.close();
console.log("OK");
