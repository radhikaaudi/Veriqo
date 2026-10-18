// Records the Veriqo demo video from the REAL deployed app (no mocked UI, no faked loading).
//   node record-demo.js            → demo-assets/video/veriqo-demo.mp4 (+ -captions-only.mp4)
// Narration is macOS `say` (text-to-speech); captions are an overlay injected into the page.
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL || "https://veriqo-api-920194228751.us-central1.run.app";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const FFMPEG = process.env.FFMPEG || "/private/tmp/veriqo_venv/lib/python3.14/site-packages/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1";
const VOICE = process.env.VOICE || "Samantha";
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "demo-assets/video");
const WORK = path.join(OUT, "work");
const IMG = (f) => path.join(ROOT, "test-assets/vehicles", f);
fs.mkdirSync(WORK, { recursive: true });

// ---------- closing card: fill in the REAL measured numbers ----------
const res = JSON.parse(fs.readFileSync(path.join(__dirname, "results/results.json"), "utf8")).results;
const browserRows = res.filter((r) => ["pass", "fail"].includes(r.status));
const e2e = `${browserRows.filter((r) => r.status === "pass").length}/${browserRows.length}`;
const closing = fs.readFileSync(path.join(OUT, "cards/closing.template.html"), "utf8")
  .replace("{{API_TESTS}}", process.env.API_TESTS || "?").replace("{{E2E}}", e2e)
  .replace("{{EVAL}}", process.env.EVAL || "?").replace("{{URL}}", BASE.replace("https://", ""));
fs.writeFileSync(path.join(OUT, "cards/closing.html"), closing);

const SEGMENTS = [
  { id: "intro", say: "Buying a used car means trusting photos and paperwork you can't verify. Veriqo shows a buyer what the photos reveal, what the record says, what is still uncertain, and what to inspect before paying.",
    cap: "The problem: buyers pay for cars they can't fully verify.",
    act: async (p) => { await p.goto("file://" + path.join(OUT, "cards/title.html")); await p.waitForTimeout(800); } },
  { id: "upload", say: "This is the live app on Google Cloud Run. We enter a test registration number, the make and model from the seller's listing, and five test photos. They are real, openly licensed images, not a customer's car.",
    cap: "Live app on Cloud Run · synthetic test plate · 5 openly licensed test photos",
    act: async (p) => {
      await p.goto(BASE + "/", { waitUntil: "networkidle" });
      await caption(p, "Live app on Cloud Run · synthetic test plate · 5 openly licensed test photos");
      await p.type("#reg", "ZZ01TC0002", { delay: 90 });
      await p.type("#claimed", "Hyundai Verna", { delay: 70 });
      await smooth(p, "label.mt >> nth=1");
      await p.setInputFiles('input[type="file"]', ["01-clean-front.jpg", "02-clean-side.jpg", "03-clean-rear.jpg", "07-worn-tyre.jpg", "08-interior-damage.jpg"].map(IMG));
      await p.waitForTimeout(600);
      await smooth(p, "button.cta");
    } },
  { id: "analyze", say: "Gemini 2.5 Flash on Vertex AI reads every photo and returns structured findings, each linked to the photo it came from. Then the registration lookup runs. In this demo it is simulated.",
    cap: "Real analysis in progress: Gemini 2.5 Flash on Vertex AI → simulated registration lookup → rules",
    act: async (p) => { await p.click("button.cta"); await p.waitForSelector(".report", { timeout: 120000 }); await p.waitForTimeout(400); } },
  { id: "score", say: "The score is not a guess. It is the sum of fixed, published rules, and the breakdown shows exactly where every point came from.",
    cap: "Score = sum of published rules · breakdown shows where every point came from",
    act: async (p) => { await smooth(p, ".riskhead"); await highlight(p, ".riskhead"); } },
  { id: "labels", say: "Every finding carries one of four labels. Observed means seen in the photos, like the worn tyre and the torn seat. Record means read from the registration data. Inferred means a rule applied to that data, like the expired insurance. And not checked is what photos can never prove, such as accident history or the engine.",
    cap: "Four labels: Observed · Record · Inferred · Not checked",
    act: async (p) => { await smooth(p, ".legend"); await highlight(p, ".legend"); await p.waitForTimeout(2500);
      for (const g of ["group-observed", "group-record", "group-inferred", "group-not_checked"]) {
        if (await p.locator("." + g).count()) { await smooth(p, "." + g); await p.waitForTimeout(2600); } } } },
  { id: "simulated", say: "This registration record is synthetic test data, so it is labelled simulated, not government verified, wherever it appears.",
    cap: "Synthetic record → labelled SIMULATED — NOT GOVERNMENT VERIFIED",
    act: async (p) => { await smooth(p, ".src-tag"); await highlight(p, ".src-tag"); } },
  { id: "checklist", say: "Finally, a prioritised checklist tells the buyer exactly what to do before paying.",
    cap: "Prioritised buyer checklist",
    act: async (p) => { await smooth(p, ".checklist"); await highlight(p, ".checklist"); } },
  { id: "persist", say: "The report is saved in Firestore, with the photos in a private Cloud Storage bucket. Reloading the link brings back the same report.",
    cap: "Saved in Firestore · photos in private Cloud Storage · reload restores the report",
    act: async (p) => { await p.reload({ waitUntil: "networkidle" }); await caption(p, "Saved in Firestore · photos in private Cloud Storage · reload restores the report");
      await p.waitForSelector(".report"); await smooth(p, ".report-actions"); await highlight(p, ".report-actions .share"); } },
  { id: "failure", say: "Now a failure case: a blurry photo, and a plate with no record. Veriqo lowers its confidence, makes no confident claims, and marks the registration as not verified, instead of inventing data.",
    cap: "Failure case: blurry photo + plate with no record",
    act: async (p) => {
      await p.click("text=Verify another car"); await p.waitForTimeout(600);
      await caption(p, "Failure case: blurry photo + plate with no record");
      await p.type("#reg", "ZZ99NOREC0", { delay: 80 });
      await p.setInputFiles('input[type="file"]', [IMG("09-blurry-car.jpg")]);
      await p.click("button.cta"); await p.waitForSelector(".report", { timeout: 120000 });
      await smooth(p, ".banners"); await highlight(p, ".banners"); await p.waitForTimeout(2500);
      await smooth(p, ".empty-state"); await highlight(p, ".empty-state"); } },
  { id: "close", say: "Under the hood: Cloud Run, Gemini on Vertex AI, Firestore and Cloud Storage, with automated API tests and a browser test matrix run against this deployment. Veriqo. Know what to check before you buy.",
    cap: "Cloud Run · Gemini 2.5 Flash (Vertex AI) · Firestore · Cloud Storage",
    act: async (p) => { await p.goto("file://" + path.join(OUT, "cards/closing.html")); await p.waitForTimeout(800); } },
];

async function caption(page, text) {
  await page.evaluate((t) => {
    let el = document.getElementById("__cap");
    if (!el) {
      el = document.createElement("div"); el.id = "__cap";
      Object.assign(el.style, { position: "fixed", left: "50%", bottom: "22px", transform: "translateX(-50%)", zIndex: 99999,
        background: "rgba(30,26,30,.86)", color: "#fff", font: "600 17px 'Exo 2',system-ui,sans-serif", padding: "10px 18px",
        borderRadius: "10px", maxWidth: "88%", textAlign: "center", boxShadow: "0 6px 24px rgba(0,0,0,.25)", letterSpacing: ".01em" });
      document.body.appendChild(el);
    }
    el.textContent = t;
  }, text);
}
async function smooth(page, sel) {
  await page.locator(sel).first().evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await page.waitForTimeout(1100);
}
async function highlight(page, sel) {
  await page.locator(sel).first().evaluate((el) => {
    el.style.transition = "box-shadow .3s"; el.style.boxShadow = "0 0 0 4px rgba(115,75,94,.45)";
    setTimeout(() => (el.style.boxShadow = ""), 2400);
  });
}
function durationSec(file) {
  const out = execFileSync("afinfo", [file]).toString();
  return parseFloat(/estimated duration: ([\d.]+)/.exec(out)[1]);
}

(async () => {
  // 1) narration audio per segment
  for (const s of SEGMENTS) {
    s.audio = path.join(WORK, `${s.id}.aiff`);
    execFileSync("say", ["-v", VOICE, "-r", "178", "-o", s.audio, s.say]);
    s.dur = durationSec(s.audio);
  }
  // 2) record the real app
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: "light",
    recordVideo: { dir: WORK, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  const t0 = Date.now();
  for (const s of SEGMENTS) {
    s.start = (Date.now() - t0) / 1000;
    const work = s.act(page);
    if (["intro", "close"].includes(s.id)) { await work; await caption(page, s.cap); }
    else { await caption(page, s.cap).catch(() => {}); await work; await caption(page, s.cap).catch(() => {}); }
    const spent = (Date.now() - t0) / 1000 - s.start;
    if (spent < s.dur + 0.5) await page.waitForTimeout((s.dur + 0.5 - spent) * 1000);
    console.log(`${s.id.padEnd(10)} start ${s.start.toFixed(1)}s  audio ${s.dur.toFixed(1)}s  took ${((Date.now() - t0) / 1000 - s.start).toFixed(1)}s`);
  }
  await page.waitForTimeout(1500);
  const raw = await page.video().path();
  await ctx.close(); await browser.close();
  const total = (Date.now() - t0) / 1000;

  // 3) narration track: each segment placed at its recorded start time
  const inputs = SEGMENTS.flatMap((s) => ["-i", s.audio]);
  const filters = SEGMENTS.map((s, i) => `[${i}:a]adelay=${Math.round(s.start * 1000)}|${Math.round(s.start * 1000)}[a${i}]`).join(";");
  const mix = SEGMENTS.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${SEGMENTS.length}:normalize=0,apad[out]`;
  const narration = path.join(WORK, "narration.wav");
  execFileSync(FFMPEG, ["-y", ...inputs, "-filter_complex", `${filters};${mix}`, "-map", "[out]", "-t", String(total), narration], { stdio: "ignore" });

  // 4) final MP4s
  const mp4 = path.join(OUT, "veriqo-demo.mp4");
  const silent = path.join(OUT, "veriqo-demo-captions-only.mp4");
  execFileSync(FFMPEG, ["-y", "-i", raw, "-i", narration, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium",
    "-c:a", "aac", "-b:a", "160k", "-shortest", mp4], { stdio: "ignore" });
  execFileSync(FFMPEG, ["-y", "-i", raw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-an", silent], { stdio: "ignore" });
  fs.writeFileSync(path.join(OUT, "segments.json"), JSON.stringify(SEGMENTS.map(({ id, start, dur, say, cap }) => ({ id, start, dur, say, cap })), null, 2));
  console.log(`\n✔ ${mp4}\n✔ ${silent}\nlength ≈ ${total.toFixed(1)} s`);
})().catch((e) => { console.error("RECORDING FAILED", e); process.exit(1); });
