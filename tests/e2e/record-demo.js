// Records the Veriqo demo video from the REAL deployed app (no mocked UI, no faked loading).
//   API_TESTS=21 EVAL=67/67 node record-demo.js
// Outputs (demo-assets/video/):
//   veriqo-demo.mp4           narrated, subtitles burned in
//   veriqo-demo-no-voice.mp4  same picture, no audio (for your own voice-over)
//   veriqo-demo.srt           subtitle file (upload alongside the video on YouTube)
// Narration = macOS `say`. Gemini waits are shown with a live timer — never cut or sped up.
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
const CARDS = path.join(OUT, "cards");
const WORK = path.join(OUT, "work");
const IMG = (f) => path.join(ROOT, "test-assets/vehicles", f);
fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
for (const old of ["veriqo-demo-captions-only.mp4", "segments.json"]) fs.rmSync(path.join(OUT, old), { force: true });

// closing card gets the REAL measured numbers
const res = JSON.parse(fs.readFileSync(path.join(__dirname, "results/results.json"), "utf8")).results;
const br = res.filter((r) => ["pass", "fail"].includes(r.status));
fs.writeFileSync(path.join(CARDS, "closing.html"),
  fs.readFileSync(path.join(CARDS, "closing.template.html"), "utf8")
    .replace("{{API_TESTS}}", process.env.API_TESTS || "?")
    .replace("{{E2E}}", `${br.filter((r) => r.status === "pass").length}/${br.length}`)
    .replace("{{EVAL}}", process.env.EVAL || "?")
    .replace("{{URL}}", BASE.replace("https://", "")));

// ---------- live-timer state for the two real Gemini waits ----------
const waits = {};
const timer = (key, label) => () => {
  const w = waits[key];
  if (!w || !w.start) return label;
  const s = (((w.end || Date.now()) - w.start) / 1000).toFixed(0);
  return w.end ? `✓ Gemini finished in ${s} s (real time, not edited)` : `⏱ ${label} — ${s} s · real time, not edited`;
};

const SEGMENTS = [
  { id: "intro", chap: "",
    say: "Buying a used car means trusting photos and paperwork you can't verify. Veriqo shows the buyer what the photos reveal, what the record says, what is still uncertain, and what to inspect before paying.",
    act: async (p) => { await p.goto(`file://${CARDS}/title.html`); } },
  { id: "how", chap: "",
    say: "Here's how it works. The buyer adds photos, the registration number and the seller's listing. Gemini 2.5 Flash on Vertex AI turns the photos into structured findings. A registration lookup adds record facts, which are simulated in this demo. Then a deterministic rules engine scores everything, and the report labels each finding as observed, record, inferred, or not checked.",
    act: async (p) => { await p.goto(`file://${CARDS}/how-it-works.html`); } },
  { id: "upload", chap: "1 · Upload — live app on Cloud Run",
    say: "Now the live app on Cloud Run. I enter a synthetic test plate and the make and model from the listing, then upload five openly licensed test photos. Each photo is numbered, so every finding can point back to it.",
    act: async (p) => {
      await p.goto(BASE + "/", { waitUntil: "networkidle" });
      await p.type("#reg", "ZZ01TC0002", { delay: 85 });
      await p.type("#claimed", "Hyundai Verna", { delay: 65 });
      await scrollTo(p, ".dropzone");
      await p.setInputFiles('input[type="file"]', ["01-clean-front.jpg", "02-clean-side.jpg", "03-clean-rear.jpg", "07-worn-tyre.jpg", "08-interior-damage.jpg"].map(IMG));
      await p.waitForTimeout(500);
      await scrollTo(p, ".thumbs");
    } },
  { id: "analyze", chap: timer("main", "Gemini 2.5 Flash is analysing 5 photos"),
    say: "Gemini is analysing the photos now, and this wait is real, not edited. Each photo is sent with a strict response schema: the defect, where it is, its severity on a fixed rubric, which photo shows it, which views of the car are covered, and a confidence score. The temperature is zero, so the same photos give the same answer.",
    act: async (p) => {
      await p.click("button.cta");
      waits.main = { start: Date.now() };
      await p.waitForSelector(".analyzing", { timeout: 10000 }).catch(() => {});
      await scrollTo(p, ".analyzing");
      await p.waitForSelector(".report", { timeout: 120000 });
      waits.main.end = Date.now();
    } },
  { id: "score", chap: "2 · Score — sum of published rules",
    say: "Here is the result. The score is not a guess. It is the sum of published points for each finding, and this bar shows how much came from the visible condition, the record, and uncertainty.",
    act: async (p) => { await scrollTo(p, ".riskhead"); await glow(p, ".riskhead"); } },
  { id: "labels", chap: "3 · Four labels: Observed · Record · Inferred · Not checked",
    say: "Each finding carries one of four labels. Observed means Gemini saw it in a photo, shown right beside it, like the worn tyre and the torn seat. Record means it was read from the registration data, such as the active loan. Inferred means a rule was applied to that data, like the expired insurance. And not checked lists what photos can never prove, such as accident history or the engine.",
    act: async (p) => {
      await scrollTo(p, ".legend"); await glow(p, ".legend"); await p.waitForTimeout(2600);
      for (const g of ["group-observed", "group-record", "group-inferred", "group-not_checked"]) {
        if (await p.evaluate((c) => !!document.querySelector("." + c), g)) { await scrollTo(p, "." + g, "start"); await p.waitForTimeout(3600); }
      }
    } },
  { id: "simulated", chap: "4 · Simulated record — clearly labelled",
    say: "Because this registration record is synthetic test data, it is labelled simulated, not government verified, wherever it appears.",
    act: async (p) => { await scrollTo(p, ".src-tag"); await glow(p, ".src-tag"); } },
  { id: "checklist", chap: "5 · What to check before paying",
    say: "The buyer then gets a prioritised checklist of what to do before paying.",
    act: async (p) => { await scrollTo(p, ".checklist", "start"); await glow(p, ".checklist"); } },
  { id: "persist", chap: "6 · Saved in Firestore · audit trail",
    say: "The report is saved in Firestore, with the photos in a private Cloud Storage bucket. Reloading the link restores it, and the audit trail shows every step that produced it.",
    act: async (p) => {
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForSelector(".report", { timeout: 30000 });
      await p.evaluate(() => { const d = [...document.querySelectorAll("details.disclose")].pop(); if (d) d.open = true; });
      await scrollTo(p, ".audit"); await glow(p, ".audit");
    } },
  { id: "failure", chap: timer("fail", "Failure case: Gemini analysing a blurry photo"),
    say: "Now a failure case: a blurry photo, and a plate that has no record. Watch what Veriqo does with weak evidence.",
    act: async (p) => {
      await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Verify another car"))?.click());
      await p.waitForTimeout(700);
      await p.type("#reg", "ZZ99NOREC0", { delay: 85 });
      await p.setInputFiles('input[type="file"]', [IMG("09-blurry-car.jpg")]);
      await p.click("button.cta");
      waits.fail = { start: Date.now() };
      await p.waitForSelector(".report", { timeout: 120000 });
      waits.fail.end = Date.now();
    } },
  { id: "failure2", chap: "7 · Honest when evidence is weak",
    say: "It lowers its confidence, makes no claims it cannot see, and marks the registration as not verified, instead of inventing data.",
    act: async (p) => {
      await scrollTo(p, ".banners"); await glow(p, ".banners"); await p.waitForTimeout(3000);
      await scrollTo(p, ".empty-state"); await glow(p, ".empty-state");
    } },
  { id: "close", chap: "",
    say: "Under the hood: Cloud Run, Gemini 2.5 Flash on Vertex AI, Firestore and Cloud Storage. We tested it with automated API tests, scoring rule checks, and browser tests on this live deployment, and fixed the model errors those tests found. Veriqo. Know what to check before you buy.",
    act: async (p) => { await p.goto(`file://${CARDS}/closing.html`); } },
];

// ---------- page helpers (plain DOM calls — nothing that can auto-wait) ----------
async function scrollTo(page, sel, block = "center") {
  await page.evaluate(([s, b]) => document.querySelector(s)?.scrollIntoView({ behavior: "smooth", block: b }), [sel, block]);
  await page.waitForTimeout(1100);
}
async function glow(page, sel) {
  await page.evaluate((s) => {
    const el = document.querySelector(s); if (!el) return;
    el.style.transition = "box-shadow .3s"; el.style.boxShadow = "0 0 0 4px rgba(115,75,94,.5)";
    setTimeout(() => (el.style.boxShadow = ""), 2600);
  }, sel);
}
async function overlay(page, chap, sub) {
  await page.evaluate(([c, s]) => {
    const mk = (id, css) => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement("div"); el.id = id; Object.assign(el.style, css); document.documentElement.appendChild(el); }
      return el;
    };
    const font = "'Exo 2', system-ui, sans-serif";
    const ch = mk("__chap", { position: "fixed", top: "70px", left: "16px", zIndex: 2147483647, background: "rgba(115,75,94,.94)",
      color: "#fff", font: `600 14px ${font}`, padding: "6px 12px", borderRadius: "8px", letterSpacing: ".01em", pointerEvents: "none" });
    const sb = mk("__sub", { position: "fixed", left: "50%", bottom: "18px", transform: "translateX(-50%)", zIndex: 2147483647,
      background: "rgba(20,17,20,.84)", color: "#fff", font: `500 19px ${font}`, lineHeight: "1.35", padding: "8px 16px",
      borderRadius: "10px", maxWidth: "86%", textAlign: "center", pointerEvents: "none" });
    if (ch.textContent !== c) ch.textContent = c;
    ch.style.display = c ? "block" : "none";
    if (sb.textContent !== s) sb.textContent = s;
    sb.style.display = s ? "block" : "none";
  }, [chap, sub]);
}

// split narration into subtitle lines, timed proportionally to their length within the audio
function chunks(text) {
  const out = [];
  for (const sent of text.split(/(?<=[.?!:])\s+/)) {
    if (sent.length <= 92) { out.push(sent); continue; }
    let rest = sent;
    while (rest.length > 92) {
      const cut = Math.max(rest.lastIndexOf(", ", 80), rest.lastIndexOf(" ", 88));
      out.push(rest.slice(0, cut + 1).trim()); rest = rest.slice(cut + 1).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}
const durationSec = (f) => parseFloat(/estimated duration: ([\d.]+)/.exec(execFileSync("afinfo", [f]).toString())[1]);
const srtTime = (s) => {
  const ms = Math.max(0, Math.round(s * 1000));
  const h = String(Math.floor(ms / 3600000)).padStart(2, "0"), m = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const sec = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  return `${h}:${m}:${sec},${String(ms % 1000).padStart(3, "0")}`;
};

(async () => {
  // 1) narration audio + subtitle lines per segment
  for (const s of SEGMENTS) {
    s.audio = path.join(WORK, `${s.id}.aiff`);
    execFileSync("say", ["-v", VOICE, "-r", "180", "-o", s.audio, s.say]);
    s.dur = durationSec(s.audio);
    const lines = chunks(s.say), total = lines.reduce((a, l) => a + l.length, 0);
    let acc = 0;
    s.lines = lines.map((l) => { const st = acc; acc += (l.length / total) * s.dur; return { text: l, from: st, to: acc }; });
  }

  // 2) record the real app
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: "light",
    recordVideo: { dir: WORK, size: { width: 1280, height: 720 } } });
  const page = await ctx.newPage();
  const created = Date.now();
  await page.goto(`file://${CARDS}/title.html`);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(1500);                          // warm-up: trimmed out of the final video
  const t0 = Date.now();
  const lead = (t0 - created) / 1000;

  let current = null, busy = false;
  const ticker = setInterval(async () => {
    if (busy || !current) return; busy = true;
    const el = (Date.now() - t0) / 1000 - current.start;
    const line = current.lines.find((l) => el >= l.from && el < l.to);
    const chap = typeof current.chap === "function" ? current.chap() : current.chap;
    await overlay(page, chap, line ? line.text : "").catch(() => {});
    busy = false;
  }, 200);

  for (const s of SEGMENTS) {
    s.start = (Date.now() - t0) / 1000;
    current = s;
    const t = Date.now();
    await s.act(page);
    const actTook = (Date.now() - t) / 1000;
    const spent = (Date.now() - t0) / 1000 - s.start;
    if (spent < s.dur + 0.6) await page.waitForTimeout((s.dur + 0.6 - spent) * 1000);
    s.end = (Date.now() - t0) / 1000;
    console.log(`${s.id.padEnd(10)} start ${s.start.toFixed(1).padStart(6)}s  voice ${s.dur.toFixed(1).padStart(5)}s  actions ${actTook.toFixed(1).padStart(5)}s  segment ${(s.end - s.start).toFixed(1)}s`);
  }
  current = { start: 0, lines: [], chap: "" };
  await page.waitForTimeout(1200);
  clearInterval(ticker);
  const raw = await page.video().path();
  await ctx.close(); await browser.close();
  const total = (Date.now() - t0) / 1000;

  // 3) narration track: each segment's voice placed at its recorded start
  const inputs = SEGMENTS.flatMap((s) => ["-i", s.audio]);
  const delays = SEGMENTS.map((s, i) => `[${i}:a]adelay=${Math.round(s.start * 1000)}|${Math.round(s.start * 1000)}[a${i}]`).join(";");
  const mix = SEGMENTS.map((_, i) => `[a${i}]`).join("") + `amix=inputs=${SEGMENTS.length}:normalize=0,apad[out]`;
  const narration = path.join(WORK, "narration.wav");
  execFileSync(FFMPEG, ["-y", ...inputs, "-filter_complex", `${delays};${mix}`, "-map", "[out]", "-t", total.toFixed(2), narration], { stdio: "ignore" });

  // 4) subtitles file (same timings as the burned-in subtitles)
  let n = 0;
  const srt = SEGMENTS.flatMap((s) => s.lines.map((l) => `${++n}\n${srtTime(s.start + l.from)} --> ${srtTime(s.start + l.to)}\n${l.text}\n`)).join("\n");
  fs.writeFileSync(path.join(OUT, "veriqo-demo.srt"), srt);

  // 5) final MP4s (warm-up lead trimmed off)
  const enc = ["-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "19", "-preset", "medium", "-movflags", "+faststart"];
  execFileSync(FFMPEG, ["-y", "-ss", lead.toFixed(3), "-i", raw, "-i", narration, "-map", "0:v", "-map", "1:a", ...enc,
    "-c:a", "aac", "-b:a", "160k", "-t", total.toFixed(2), path.join(OUT, "veriqo-demo.mp4")], { stdio: "ignore" });
  execFileSync(FFMPEG, ["-y", "-ss", lead.toFixed(3), "-i", raw, ...enc, "-an", "-t", total.toFixed(2),
    path.join(OUT, "veriqo-demo-no-voice.mp4")], { stdio: "ignore" });
  fs.writeFileSync(path.join(OUT, "segments.json"), JSON.stringify(SEGMENTS.map(({ id, start, end, dur, say }) => ({ id, start, end, voice: dur, say })), null, 2));
  console.log(`\nlength ${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")}${total > 180 ? "  ⚠ OVER 3 MINUTES" : "  (under 3:00)"}`);
  console.log(`Gemini waits: main ${((waits.main.end - waits.main.start) / 1000).toFixed(1)}s · failure ${((waits.fail.end - waits.fail.start) / 1000).toFixed(1)}s`);
})().catch((e) => { console.error("RECORDING FAILED", e); process.exit(1); });
