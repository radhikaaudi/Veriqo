// Captures genuine screenshots of the deployed app for the PPT (no mock UI).
//   node screenshots.js   → demo-assets/screenshots/*.png
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL || "https://veriqo-api-920194228751.us-central1.run.app";
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "demo-assets/screenshots");
const IMG = (f) => path.join(ROOT, "test-assets/vehicles", f);
fs.mkdirSync(OUT, { recursive: true });
const PHOTOS = ["01-clean-front.jpg", "02-clean-side.jpg", "03-clean-rear.jpg", "07-worn-tyre.jpg", "08-interior-damage.jpg"];

async function at(page, sel, file, offset = 90) {
  await page.locator(sel).first().evaluate((el, off) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - off), offset);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, file) });
  console.log("✔", file);
}

(async () => {
  const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto(BASE + "/", { waitUntil: "networkidle" });
    if (scheme === "light") {
      await p.screenshot({ path: path.join(OUT, "01-upload-empty.png") }); console.log("✔ 01-upload-empty.png");
    }
    await p.fill("#reg", "ZZ01TC0002");
    await p.fill("#claimed", "Hyundai Verna");
    await p.setInputFiles('input[type="file"]', PHOTOS.map(IMG));
    if (scheme === "light") await at(p, "#claimed", "02-upload-filled.png", 140);
    await p.click("button.cta");
    await p.waitForSelector(".report", { timeout: 120000 });
    await p.waitForTimeout(600);
    if (scheme === "light") {
      await at(p, ".report", "04-report-summary.png", 80);
      await at(p, ".legend", "05-findings.png", 120);
      await at(p, ".checklist", "06-checklist.png", 140);
      await at(p, ".src-tag", "11-record-simulated.png", 140);
    } else {
      await at(p, ".report", "12-report-dark.png", 80);
    }
    await ctx.close();
  }
  await browser.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
