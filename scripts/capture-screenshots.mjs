import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const OUT = "/home/runner/workspace/artifacts/site/public/screenshots";
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:80";
const pages = [
  ["dashboard", "/"],
  ["meldingen", "/meldingen"],
  ["reserveringen", "/reserveringen"],
  ["werkplekken", "/werkplekken"],
  ["bezoekers", "/bezoekers"],
  ["vastgoed", "/vastgoed"],
  ["ruimtes", "/ruimtes"],
  ["assets", "/assets"],
  ["contracten", "/contracten"],
  ["webshop", "/webshop"],
  ["duurzaamheid", "/duurzaamheid"],
  ["mjop", "/mjop"],
  ["kennisbank", "/kennisbank"],
  ["sleutelbeheer", "/sleutelbeheer"],
];

const browser = await chromium.launch({
  executablePath:
    "/nix/store/5afrhwm7zqn1vb7p5z1mc2rkh2grsfgz-ungoogled-chromium-138.0.7204.100/bin/chromium",
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

// login via API to get session cookie
const resp = await ctx.request.post(`${BASE}/api/auth/login`, {
  data: { email: "ruben@govconnect.nl", password: "demo2026" },
});
if (!resp.ok()) {
  console.error("Login failed", resp.status(), await resp.text());
  process.exit(1);
}

for (const [name, path] of pages) {
  try {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log("captured", name);
  } catch (e) {
    console.error("FAILED", name, e.message);
  }
}
await browser.close();
