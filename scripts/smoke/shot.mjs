// Screenshot helper: node scripts/smoke/shot.mjs <url> <out.png> [theme] [auth]
import puppeteer from "puppeteer-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const [url, out, theme = "light", auth = ""] = process.argv.slice(2);
if (!url || !out) {
  console.error("uso: shot.mjs <url> <out.png> [light|dark] [auth]");
  process.exit(1);
}

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--no-sandbox", "--force-device-scale-factor=2"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.emulateMediaFeatures([
  { name: "prefers-color-scheme", value: theme },
]);

if (auth === "auth") {
  const env = Object.fromEntries(
    readFileSync(fileURLToPath(new URL("../../.env.local", import.meta.url)), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
  const base = new URL(url).origin;
  await page.goto(`${base}/login`, { waitUntil: "networkidle0" });
  await page.type('input[name="email"]', env.BOOTSTRAP_OWNER_EMAIL ?? "");
  await page.type('input[name="password"]', env.BOOTSTRAP_OWNER_PASSWORD ?? "");
  await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle0", timeout: 20000 }).catch(() => null),
    page.click('button[type="submit"]'),
  ]);
  await page
    .waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 15000 })
    .catch(() => null);
  console.log("login:", page.url());
}

await page.goto(url, { waitUntil: "networkidle0", timeout: 45000 });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: out });
await browser.close();
console.log("ok", out);
