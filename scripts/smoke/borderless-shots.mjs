/**
 * Capturas del rediseño "sin bordes": login por UI y screenshots de rutas clave.
 * Uso: node scripts/smoke/borderless-shots.mjs <baseUrl>
 */
import puppeteer from "puppeteer-core";
import { readFileSync, mkdirSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3102";
const outDir = new URL("../../docs/redesign/", import.meta.url);
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

// Login
await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
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
  ["pagos", "/crm/pagos"],
  ["configuracion", "/crm/configuracion"],
];
for (const [name, path] of routes) {
  await page.goto(`${base}${path}`, { waitUntil: "networkidle0", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 600));
  await shot(`04-${name}-sin-bordes`);
}

await browser.close();
console.log("OK");
