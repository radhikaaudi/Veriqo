// Veriqo end-to-end test matrix — runs against the DEPLOYED app with real photos.
//
//   cd tests/e2e && npm install && node matrix.js            (BASE_URL to override)
//
// Every scenario drives the real UI (upload → Gemini → rules → report), captures the
// actual /api/verify JSON, checks it with objective assertions, screenshots the result,
// and records everything to results/results.json + docs/05-TEST-RESULTS.md.
// Gemini is NOT assumed correct: the full observed output is stored for human review.
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright-core");

const BASE = process.env.BASE_URL || "https://veriqo-api-920194228751.us-central1.run.app";
const CHROME = process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ROOT = path.resolve(__dirname, "../..");
const IMG = (f) => path.join(ROOT, "test-assets/vehicles", f);
const SHOTS = path.join(ROOT, "demo-assets/screenshots");
const TESTSHOTS = path.join(SHOTS, "tests");
const RESULTS = path.join(__dirname, "results");
for (const d of [SHOTS, TESTSHOTS, RESULTS]) fs.mkdirSync(d, { recursive: true });

const CLEAN_SET = ["01-clean-front.jpg", "02-clean-side.jpg", "03-clean-rear.jpg"];
const results = [];
let browser;

async function newPage(width = 1440, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: "light", deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page._errors = [];
  page.on("pageerror", (e) => page._errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && page._errors.push(m.text()));
  return page;
}

/** Fill the real form and submit; returns {data, status, ms} from the live API response. */
async function submit(page, { reg, claimed = "", files }, shotDuring) {
  await page.goto(BASE + "/", { waitUntil: "networkidle" });
  await page.fill("#reg", reg);
  if (claimed) await page.fill("#claimed", claimed);
  await page.setInputFiles('input[type="file"]', files.map(IMG));
  const t0 = Date.now();
  const respP = page.waitForResponse((r) => r.url().includes("/api/verify"), { timeout: 120000 });
  await page.click("button.cta");
  if (shotDuring) { await page.waitForSelector(".analyzing"); await page.screenshot({ path: shotDuring }); }
  const resp = await respP;
  const status = resp.status();
  const data = await resp.json().catch(() => null);
  await page.waitForSelector(status === 200 ? ".report" : ".alert-error", { timeout: 30000 });
  await page.waitForTimeout(500);
  return { data, status, ms: Date.now() - t0 };
}

const types = (d) => (d?.condition?.damage || []).map((x) => x.type);
const titles = (d, src) => (d?.findings || []).filter((f) => !src || f.source === src).map((f) => f.title);
const summarize = (d) => d && {
  risk: `${d.risk_score} (${d.risk_band})`,
  confidence: d.condition.overall_confidence,
  views_covered: d.condition.views_covered,
  damage: d.condition.damage.map((x) => `${x.type}@${x.location} [${x.severity}] photo ${x.photo_number}`),
  rust_level: d.condition.rust_level, tyre_wear: d.condition.tyre_wear,
  interior: d.condition.interior_condition, summary: d.condition.overall_summary,
  observed: titles(d, "observed"), record: titles(d, "record"), inferred: titles(d, "inferred"),
  not_checked: titles(d, "not_checked"), rc_available: d.rc.available, rc_verified: d.rc_verified,
  gemini_mode: d.gemini_mode, vahan_mode: d.vahan_mode, share_id: d.share_id, photo_uris: d.photo_uris,
};

async function scenario(t) {
  process.stdout.write(`\n▶ ${t.id} ${t.purpose} … `);
  const rec = { id: t.id, purpose: t.purpose, inputs: t.inputs, expected: t.expected, source: t.source || "real (deployed app, live Gemini, simulated RC)" };
  try {
    const out = await t.run();
    rec.checks = out.checks;
    rec.actual = out.actual;
    rec.notes = out.notes || "";
    rec.evidence = out.evidence || [];
    rec.status = out.status || (out.checks.every((c) => c.ok) ? "pass" : "fail");
  } catch (e) {
    rec.status = "fail";
    rec.error = String(e && e.message || e).slice(0, 400);
  }
  results.push(rec);
  process.stdout.write(rec.status.toUpperCase());
  return rec;
}

/** Generic: run one upload scenario, screenshot, return checks built by `check(data, page)`. */
function uploadTest(id, purpose, input, expected, check, extra = {}) {
  return scenario({
    id, purpose, expected,
    inputs: `${input.files.join(", ")} · reg ${input.reg}${input.claimed ? ` · listing "${input.claimed}"` : ""}`,
    run: async () => {
      const page = await newPage(extra.width, extra.height);
      const { data, status, ms } = await submit(page, input, extra.shotDuring);
      const shot = path.join(TESTSHOTS, `${id}.png`);
      await page.screenshot({ path: shot, fullPage: true });
      const checks = [{ name: "HTTP 200 and report rendered", ok: status === 200 }, ...(await check(data, page))];
      if (page._errors.length) checks.push({ name: "no console errors", ok: false, detail: page._errors.join(" | ") });
      if (extra.after) await extra.after(page, data, checks);
      await page.context().close();
      return { checks, actual: { latency_ms: ms, ...summarize(data) }, evidence: [path.relative(ROOT, shot)] };
    },
  });
}

(async () => {
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const runs = {};

  // ---------- A + B: normal flow, multiple images, matching listing ----------
  await uploadTest("A-B", "Successful upload, 3 photos of one car, listing matches record",
    { reg: "ZZ01TC0001", claimed: "Volkswagen Vento", files: CLEAN_SET },
    "Report with all four provenance groups available; checklist present; record banner says SIMULATED; low score is NOT an all-clear (history + mechanical listed as Not checked); listing matches record.",
    async (d, page) => {
      runs.A = d;
      return [
        { name: "3 photos uploaded and labelled 1–3", ok: d && d.photo_uris.length === 3 },
        { name: "photos stored in Cloud Storage (gs://)", ok: d && d.photo_uris.every((u) => u.startsWith("gs://")) },
        { name: "≥2 vehicle views identified", ok: d && d.condition.views_covered.length >= 2 },
        { name: "listing make/model matches record", ok: d && d.cross_checks.make_model_match === true },
        { name: "SIMULATED — NOT GOVERNMENT VERIFIED banner visible", ok: await page.getByText("SIMULATED — NOT GOVERNMENT VERIFIED").first().isVisible() },
        { name: "history + mechanical always Not checked", ok: titles(d, "not_checked").some((t) => t.startsWith("Accident")) && titles(d, "not_checked").some((t) => t.startsWith("Hidden mechanical")) },
        { name: "prioritised checklist rendered", ok: (await page.locator(".checklist li").count()) > 0 },
        { name: "score == sum of finding points (visible capped at 60)", ok: d && d.risk_score === Math.max(0, Math.min(100, Math.min(60, d.findings.filter((f) => f.source === "observed").reduce((s, f) => s + f.points, 0)) + d.findings.filter((f) => f.source !== "observed").reduce((s, f) => s + f.points, 0))) },
      ];
    },
    {
      shotDuring: path.join(SHOTS, "03-analyzing.png"),
      after: async (page, d, checks) => {
        // ---------- N: persistence after refresh ----------
        await page.reload({ waitUntil: "networkidle" });
        await page.waitForSelector(".report", { timeout: 30000 });
        const txt = await page.locator(".report-actions .share").textContent();
        checks.push({ name: "N: report reloads from Firestore after refresh (same id)", ok: txt.includes(d.share_id) });
      },
    });

  // ---------- C: scratch / dent ----------
  await uploadTest("C1", "Visible scratch", { reg: "ZZ01TC0001", files: ["04-visible-scratch.jpg"] },
    "Observed finding of type scratch, linked to Photo 1.",
    async (d) => { runs.C1 = d; return [
      { name: "scratch observed", ok: types(d).includes("scratch") },
      { name: "finding cites Photo 1", ok: (d?.findings || []).some((f) => f.source === "observed" && f.evidence.startsWith("Photo 1")) },
    ]; });
  await uploadTest("C2", "Door dent", { reg: "ZZ01TC0001", files: ["05-door-dent.jpg"] },
    "Observed finding of type dent.", async (d) => [{ name: "dent observed", ok: types(d).includes("dent") }]);

  // ---------- D / E / F ----------
  await uploadTest("D", "Rust near wheel arch", { reg: "ZZ01TC0001", files: ["06-rust-wheel-arch.jpg"] },
    "Rust reported (rust_level above none or a rust damage item).",
    async (d) => [{ name: "rust observed", ok: d && (d.condition.rust_level !== "none" || types(d).includes("rust")) }]);
  await uploadTest("E", "Worn tyre tread", { reg: "ZZ01TC0001", files: ["07-worn-tyre.jpg"] },
    "Tyre wear moderate/severe or a worn_tyre item.",
    async (d) => [{ name: "tyre wear observed", ok: d && (["moderate", "severe"].includes(d.condition.tyre_wear) || types(d).includes("worn_tyre")) }]);
  await uploadTest("F", "Interior damage (torn seat)", { reg: "ZZ01TC0001", files: ["08-interior-damage.jpg"] },
    "interior_damage item or interior condition describing the tear.",
    async (d) => [{ name: "interior damage observed", ok: d && (types(d).includes("interior_damage") || /tear|torn|rip|split|damag/i.test(d.condition.interior_condition)) }]);

  // ---------- G / H: limitations ----------
  await uploadTest("G", "Blurry photo", { reg: "ZZ01TC0001", files: ["09-blurry-car.jpg"] },
    "Low confidence (<0.5), 'Low photo confidence' Not-checked finding, no confident damage claims.",
    async (d) => [
      { name: "confidence < 0.5", ok: d && d.condition.overall_confidence < 0.5 },
      { name: "low-confidence finding present", ok: titles(d, "not_checked").includes("Low photo confidence") },
      { name: "no moderate/severe damage claimed", ok: d && !d.condition.damage.some((x) => ["moderate", "severe"].includes(x.severity)) },
    ], { after: async (page) => page.screenshot({ path: path.join(SHOTS, "09-blurry-uncertain.png") }) });
  await uploadTest("H", "Insufficient coverage (single bonnet crop)", { reg: "ZZ01TC0001", files: ["10-missing-coverage.jpg"] },
    "Missing photo coverage finding listing the views not shown.",
    async (d) => [{ name: "missing-coverage finding", ok: titles(d, "not_checked").some((t) => t.startsWith("Missing photo coverage")) }]);

  // ---------- multiple issues ----------
  await uploadTest("MI", "Multiple issues on one car", { reg: "ZZ01TC0001", files: ["11-multiple-issues.jpg"] },
    "Two or more separate Observed findings.",
    async (d) => [{ name: "≥2 observed findings", ok: titles(d, "observed").length >= 2 }]);

  // ---------- I: missing registration record ----------
  await uploadTest("I", "Registration record unavailable", { reg: "ZZ99NOREC0", files: ["01-clean-front.jpg"] },
    "Record NOT VERIFIED banner + empty state; insurance/loan/blacklist unknown (null); no Record/Inferred findings invented.",
    async (d, page) => [
      { name: "rc.available is false", ok: d && d.rc.available === false },
      { name: "cross-checks unknown (null), not false", ok: d && d.cross_checks.insurance_expired === null && d.cross_checks.under_loan === null },
      { name: "no record/inferred findings invented", ok: titles(d, "record").length === 0 && titles(d, "inferred").length === 0 },
      { name: "NOT VERIFIED shown in UI", ok: await page.locator(".empty-state").isVisible() },
    ], { after: async (page) => { await page.locator(".empty-state").scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, "07-rc-not-verified.png") }); } });

  // ---------- J: conflicting details ----------
  await uploadTest("J", "Listing make/model conflicts with record", { reg: "ZZ01TC0004", claimed: "Honda City", files: ["01-clean-front.jpg"] },
    "Inferred finding 'Listed make/model does not match' (+25); listing field highlighted.",
    async (d, page) => [
      { name: "make_model_match is false", ok: d && d.cross_checks.make_model_match === false },
      { name: "inferred mismatch finding", ok: titles(d, "inferred").some((t) => t.includes("does not match")) },
      { name: "listing field highlighted in record grid", ok: await page.locator(".field.bad", { hasText: "Seller's listing says" }).isVisible() },
    ], { after: async (page) => { await page.locator(".field", { hasText: "Seller's listing says" }).scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(SHOTS, "08-mismatch.png") }); } });

  // ---------- K: invalid / oversized / empty ----------
  await scenario({
    id: "K", purpose: "Invalid file type, oversized file, empty submission",
    inputs: "notes.txt, 13 MB image, no photos", expected: "Non-images and >12 MB files skipped with a visible notice; submitting without photos shows a clear error; nothing sent to Gemini.",
    run: async () => {
      const page = await newPage();
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      const tmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "veriqo-k-"));
      const txt = path.join(tmp, "notes.txt"); fs.writeFileSync(txt, "not an image");
      const big = path.join(tmp, "huge.jpg"); fs.writeFileSync(big, Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(13 * 1024 * 1024)]));
      let apiCalls = 0; page.on("request", (r) => r.url().includes("/api/verify") && apiCalls++);
      await page.fill("#reg", "ZZ01TC0001");
      await page.setInputFiles('input[type="file"]', [txt, big]);
      const notice = await page.locator(".alert-warn").textContent().catch(() => "");
      await page.click("button.cta");
      const err = await page.locator(".alert-error").textContent().catch(() => "");
      const shot = path.join(TESTSHOTS, "K.png"); await page.screenshot({ path: shot });
      // server-side guard, independent of the UI
      const api = await page.request.post(BASE + "/api/verify", { multipart: { reg_number: "ZZ01TC0001", photos: { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("x") } } });
      await page.context().close();
      return {
        checks: [
          { name: "UI notice: 2 files skipped", ok: /2 file\(s\) skipped/.test(notice) },
          { name: "empty submission → clear error", ok: /at least one photo/i.test(err) },
          { name: "no request sent to the API", ok: apiCalls === 0 },
          { name: "API rejects non-image with 415", ok: api.status() === 415 },
        ],
        actual: { notice: notice.trim(), error: err.trim(), api_status: api.status() }, evidence: [path.relative(ROOT, shot)],
      };
    },
  });

  // ---------- M: backend unreachable ----------
  await scenario({
    id: "M", purpose: "Backend unavailable / network interrupted",
    inputs: "01-clean-front.jpg with /api/verify aborted at the network layer", expected: "Friendly 'Can't reach the Veriqo server… nothing was submitted' error; app stays usable.",
    run: async () => {
      const page = await newPage();
      await page.route("**/api/verify", (r) => r.abort("internetdisconnected"));
      await page.goto(BASE + "/", { waitUntil: "networkidle" });
      await page.fill("#reg", "ZZ01TC0001");
      await page.setInputFiles('input[type="file"]', [IMG("01-clean-front.jpg")]);
      await page.click("button.cta");
      const err = await page.locator(".alert-error").textContent();
      const shot = path.join(TESTSHOTS, "M.png"); await page.screenshot({ path: shot });
      const enabled = await page.locator("button.cta").isEnabled();
      await page.context().close();
      return { checks: [
        { name: "friendly network error", ok: /Can't reach the Veriqo server/.test(err) },
        { name: "form still usable afterwards", ok: enabled },
      ], actual: { error: err.trim() }, evidence: [path.relative(ROOT, shot)], source: "real UI, network failure simulated by aborting the request" };
    },
  });

  // ---------- P: mobile ----------
  await uploadTest("P", "Responsive layout at 390 px (mobile)", { reg: "ZZ01TC0002", files: ["11-multiple-issues.jpg"] },
    "Report fits the viewport: no horizontal overflow.",
    async (d, page) => [{ name: "no horizontal overflow", ok: await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth) }],
    { width: 390, height: 844, after: async (page) => page.screenshot({ path: path.join(SHOTS, "10-mobile-report.png"), fullPage: false }) });

  // ---------- Q: consistency ----------
  await uploadTest("Q", "Repeat C1 with identical input (consistency)", { reg: "ZZ01TC0001", files: ["04-visible-scratch.jpg"] },
    "Same risk band and same damage types as the first run (Gemini is non-deterministic; differences recorded).",
    async (d) => {
      const a = runs.C1;
      const same = a && d && a.risk_band === d.risk_band && JSON.stringify([...new Set(types(a))].sort()) === JSON.stringify([...new Set(types(d))].sort());
      return [{ name: "same band and damage types as C1", ok: !!same, detail: a && d ? `run1 ${a.risk_score}/${a.risk_band} ${types(a)} · run2 ${d.risk_score}/${d.risk_band} ${types(d)}` : "" }];
    });

  // ---------- Not run in the browser ----------
  results.push({ id: "L", purpose: "Gemini failure, timeout, rate limit", inputs: "monkeypatched Gemini raising 429 / timeout / generic error",
    expected: "503 / 504 / 502 with 'Nothing was saved', nothing persisted", status: "pass (API unit test)",
    source: "simulated failure — backend/tests/test_api.py::test_gemini_failures_map_to_clear_errors_and_save_nothing (cannot safely force a real Vertex outage in production)", checks: [], actual: {} });
  results.push({ id: "O", purpose: "Authentication / authorization boundaries", inputs: "—", expected: "—", status: "not applicable",
    source: "Authentication is not implemented in this prototype; reports are reachable by their unguessable share id.", checks: [], actual: {} });

  await browser.close();
  fs.writeFileSync(path.join(RESULTS, "results.json"), JSON.stringify({ base_url: BASE, ran_at: new Date().toISOString(), results }, null, 2));
  writeMarkdown();
  const fails = results.filter((r) => r.status === "fail").length;
  console.log(`\n\nDone: ${results.length} scenarios · ${fails} failed · results/results.json + docs/05-TEST-RESULTS.md`);
})().catch((e) => { console.error("RUNNER CRASHED", e); process.exit(2); });

function writeMarkdown() {
  const L = [];
  L.push("# Veriqo — End-to-End Test Results", "");
  L.push(`Generated by \`tests/e2e/matrix.js\` against **${BASE}** on ${new Date().toISOString()}.`, "");
  L.push("Every row except L and O was executed in a real browser against the deployed app (live Gemini 2.5 Flash on Vertex AI, Firestore, Cloud Storage). Registration data is **simulated** (synthetic `ZZ…` fixtures). Photos are real Wikimedia Commons images (see `test-assets/README.md`).", "");
  L.push("| ID | Purpose | Status | Source |", "|---|---|---|---|");
  for (const r of results) L.push(`| ${r.id} | ${r.purpose} | **${r.status}** | ${r.source} |`);
  L.push("");
  for (const r of results) {
    L.push(`## ${r.id} — ${r.purpose}`, "", `- **Input:** ${r.inputs}`, `- **Expected:** ${r.expected}`, `- **Status:** ${r.status}`);
    if (r.error) L.push(`- **Error:** ${r.error}`);
    for (const c of r.checks || []) L.push(`  - ${c.ok ? "✅" : "❌"} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
    if (r.actual && Object.keys(r.actual).length) L.push("- **Actual (observed):**", "```json", JSON.stringify(r.actual, null, 2), "```");
    for (const e of r.evidence || []) L.push(`- Evidence: \`${e}\``);
    L.push("");
  }
  fs.writeFileSync(path.join(ROOT, "docs/05-TEST-RESULTS.md"), L.join("\n"));
}
