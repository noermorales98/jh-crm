/** Capturas de pantalla de páginas clave con sesión iniciada. */
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3100";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
    }),
);

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });

await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
await page.type('input[name="email"]', env.BOOTSTRAP_OWNER_EMAIL ?? "admin@jhmultiservices.com");
await page.type('input[name="password"]', env.BOOTSTRAP_OWNER_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 15000 });

const shots = [
  ["/crm/dashboard", "shot-dashboard.png"],
  ["/crm/clientes/cmtiflki50001va993jmguycg", "shot-cliente.png"],
  ["/crm/casos/cmtifllc80005va99b70qamya", "shot-caso.png"],
  ["/crm/cotizaciones/cmtiflpr2000sva99rf47c3g4", "shot-cotizacion.png"],
  ["/crm/auditoria", "shot-auditoria.png"],
];
for (const [path, file] of shots) {
  await page.goto(`${base}${path}`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 1500));
  await page.screenshot({ path: `scripts/smoke/${file}`, fullPage: false });
  console.log(`OK ${file}`);
}
await browser.close();
