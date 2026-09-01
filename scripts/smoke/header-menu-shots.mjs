/**
 * Capturas del menú de usuario del header (verificación visual de redesign).
 * Uso: node scripts/smoke/header-menu-shots.mjs <baseUrl>
 * Requiere .env.local (BOOTSTRAP_OWNER_PASSWORD).
 */
import puppeteer from "puppeteer-core";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "http://localhost:3101";
const outDir = fileURLToPath(new URL("../../docs/redesign/", import.meta.url));
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
await page.setViewport({ width: 1440, height: 900 });

// Login por la UI
await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', EMAIL);
await page.type('input[name="password"]', PASSWORD);
await Promise.all([
  page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => null),
  page.click('button[type="submit"]'),
]);
await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => null);
console.log("login ok:", !page.url().includes("/login"), page.url());

// 1) Dashboard con dropdown CERRADO
await page.goto(`${base}/crm/dashboard`, { waitUntil: "networkidle0" });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: `${outDir}03-header-menu-cerrado.png` });
console.log("shot: 03-header-menu-cerrado.png");

// 2) Abrir el dropdown con clic en el avatar
const avatar = await page.$('button[aria-haspopup="menu"]');
console.log("avatar encontrado:", !!avatar);
if (avatar) {
  await avatar.click();
  await page.waitForSelector('[role="menu"]', { timeout: 5000 });
  await new Promise((r) => setTimeout(r, 400));
  const items = await page.$$eval('[role="menuitem"]', (els) =>
    els.map((e) => e.textContent?.trim()),
  );
  console.log("items del menú:", JSON.stringify(items));
  const expanded = await page.$eval('button[aria-haspopup="menu"]', (el) =>
    el.getAttribute("aria-expanded"),
  );
  console.log("aria-expanded:", expanded);
  await page.screenshot({ path: `${outDir}03-header-menu-abierto.png` });
  console.log("shot: 03-header-menu-abierto.png");

  // 3) Clic en "Configuración" debe navegar a /configuracion
  const links = await page.$$('a[role="menuitem"]');
  for (const link of links) {
    const text = await link.evaluate((el) => el.textContent?.trim());
    if (text === "Configuración") {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "networkidle0", timeout: 15000 }).catch(() => null),
        link.click(),
      ]);
      break;
    }
  }
  await page.waitForFunction(() => location.pathname.startsWith("/crm/configuracion"), { timeout: 10000 }).catch(() => null);
  console.log("tras clic en Configuración:", page.url());
}

// 4) Captura de /configuracion
await new Promise((r) => setTimeout(r, 600));
await page.screenshot({ path: `${outDir}03-configuracion.png` });
console.log("shot: 03-configuracion.png");

await browser.close();
console.log("DONE");
