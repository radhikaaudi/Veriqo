import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FormEvent, type ReactNode } from "react";
import {
  verify,
  getReport,
  VerificationResult,
  Severity,
  EvidenceSource,
  Finding,
  AuditEvent,
} from "./api";

const MAX_MB = 12;

/* Labels only — all colour lives in the theme tokens (styles.css), so both
   light and dark themes recolour every badge, ring and bar automatically. */
const BAND: Record<string, string> = { low: "Low risk", medium: "Medium risk", high: "High risk", unknown: "Unknown" };

const PROV_ORDER: EvidenceSource[] = ["observed", "record", "inferred", "not_checked"];
const PROV: Record<EvidenceSource, { label: string; blurb: string }> = {
  observed: { label: "Observed", blurb: "Seen in your photos (Gemini vision)" },
  record: { label: "Record", blurb: "Read directly from the RC record" },
  inferred: { label: "Inferred", blurb: "Deterministic logic over the record" },
  not_checked: { label: "Not checked", blurb: "Out of scope — surfaced, never scored" },
};

function Pill({ variant, children, title }: { variant: string; children: ReactNode; title?: string }) {
  return (
    <span className={"pill " + variant} title={title}>
      <i className="dot" />
      {children}
    </span>
  );
}
function sevBadge(s: Severity) {
  return <span className={"pill sev sev-" + s}>{s}</span>;
}

/* ---- theme ---- */
function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const s = localStorage.getItem("veriqo-theme");
      if (s === "light" || s === "dark") return s;
    } catch { /* ignore */ }
    return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem("veriqo-theme", theme); } catch { /* ignore */ }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}

/* ============================== APP ============================== */
export default function App() {
  const { theme, toggle } = useTheme();
  const [reg, setReg] = useState("");
  const [claimed, setClaimed] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [fromLink, setFromLink] = useState(false);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // One object URL per photo, revoked when the selection changes (no leaks).
  const previews = useMemo(() => photos.map((f) => URL.createObjectURL(f)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // Reopen a saved report from its link (?r=<share id>) — proves persistence after refresh.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("r");
    if (!id) return;
    setLoading(true);
    setFromLink(true);
    getReport(id)
      .then(setResult)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const all = Array.from(list);
    const ok = all.filter((f) => f.type.startsWith("image/") && f.size <= MAX_MB * 1024 * 1024);
    const skipped = all.length - ok.length;
    const room = 8 - photos.length;
    setNotice(
      [skipped ? `${skipped} file(s) skipped — only images up to ${MAX_MB} MB are accepted.` : "",
       ok.length > room ? `Only 8 photos per report; ${ok.length - Math.max(room, 0)} not added.` : ""]
        .filter(Boolean).join(" ") || null
    );
    setPhotos((prev) => [...prev, ...ok].slice(0, 8));
  }
  function onDrop(e: DragEvent) { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }
  function removePhoto(i: number) { setPhotos((prev) => prev.filter((_, idx) => idx !== i)); }

  function startOver() {
    setResult(null); setError(null); setNotice(null); setFromLink(false);
    setPhotos([]); setReg(""); setClaimed("");
    window.history.replaceState(null, "", window.location.pathname);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!reg.trim()) return setError("Enter the vehicle registration number.");
    if (photos.length === 0) return setError("Add at least one photo of the car.");
    setLoading(true);
    try {
      const r = await verify(reg.trim(), photos, claimed.trim());
      setResult(r);
      setFromLink(false);
      window.history.replaceState(null, "", `?r=${encodeURIComponent(r.share_id)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-brand"><span className="nav-mark">◈</span> Veriqo</div>
        <div className="nav-right">
          <span className="nav-tag">Pre-purchase verification</span>
          <button className="icon-btn" onClick={toggle} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title="Toggle theme">
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </nav>

      <main className="container">
        <section className="hero">
          <h1>Know what to check <br className="br" />before you buy.</h1>
          <p>
            Upload a few photos and the registration number. Veriqo returns an evidence‑tagged
            report — what's visible, what the record says, and what to get inspected.
          </p>
        </section>

        <form className="card upload" onSubmit={onSubmit}>
          <label className="field-label" htmlFor="reg">Registration number</label>
          <input
            id="reg"
            className="reg-input"
            value={reg}
            onChange={(e) => setReg(e.target.value.toUpperCase())}
            placeholder="MH 01 AB 1234"
            autoComplete="off"
            spellCheck={false}
            aria-describedby="reg-hint"
          />
          <p id="reg-hint" className="hint">
            Demo mode: registration data is <b>simulated</b>. Synthetic test plates <code>ZZ01TC0001</code>–<code>ZZ01TC0004</code> return
            test records; any other plate is shown as <b>not verified</b> — nothing is invented.
          </p>

          <label className="field-label mt" htmlFor="claimed">
            Make &amp; model in the seller's listing <span className="optional">optional</span>
          </label>
          <input
            id="claimed"
            className="reg-input text-input"
            value={claimed}
            onChange={(e) => setClaimed(e.target.value)}
            placeholder="e.g. Honda City"
            autoComplete="off"
          />

          <label className="field-label mt">Car photos</label>
          <div
            className={"dropzone" + (drag ? " drag" : "")}
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
            role="button"
            tabIndex={0}
            aria-label="Upload car photos"
          >
            <div className="dz-icon"><UploadIcon /></div>
            <div className="dz-text">Drag &amp; drop photos, or <span className="dz-link">browse</span></div>
            <div className="dz-sub">Front &amp; rear · both sides · tyres · dashboard / odometer · interior</div>
            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          </div>

          {photos.length > 0 && (
            <div className="thumbs">
              {photos.map((f, i) => (
                <div className="thumb" key={f.name + i}>
                  <img src={previews[i]} alt={`Photo ${i + 1}`} />
                  <span className="thumb-n">{i + 1}</span>
                  <button type="button" className="thumb-x" onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}>×</button>
                </div>
              ))}
            </div>
          )}
          {notice && <div className="alert alert-warn" role="status"><WarnIcon /> <span>{notice}</span></div>}

          <button className="btn btn-primary cta" disabled={loading}>
            {loading ? "Analyzing…" : "Verify car"}
          </button>
          {error && <div className="alert alert-error" role="alert"><WarnIcon /> <span>{error}</span></div>}
        </form>

        {loading && <AnalyzingPanel reopening={fromLink} />}
        {result && !loading && <Report r={result} photos={fromLink ? [] : previews} onNew={startOver} />}

        <footer className="disclaimer">
          Veriqo is a <b>red‑flag triage</b>, not a certification. Every finding is tagged with where
          it came from — <b>observed</b> in your photos, read from the <b>record</b>, <b>inferred</b>{" "}
          by deterministic rules, or honestly marked <b>not checked</b>. It never proves a hidden
          mechanical fault or that a car is safe.
        </footer>
      </main>
    </div>
  );
}

/* ============================ ANALYZING ============================ */
function AnalyzingPanel({ reopening = false }: { reopening?: boolean }) {
  const steps = reopening
    ? ["Loading the saved report from Firestore"]
    : ["Analyzing photos with Gemini", "Checking the registration record", "Scoring & compiling findings"];
  return (
    <div className="card analyzing enter" role="status" aria-live="polite">
      <div className="spinner" />
      <div className="analyzing-body">
        <div className="analyzing-title">{reopening ? "Opening report…" : "Verifying your car…"}</div>
        <ul className="steps">
          {steps.map((s, i) => <li key={i} style={{ animationDelay: `${i * 0.5}s` }}>{s}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* ============================== REPORT ============================== */
const SEV_RANK: Record<Severity, number> = { severe: 3, moderate: 2, minor: 1, none: 0 };

function Report({ r, photos, onNew }: { r: VerificationResult; photos: string[]; onNew: () => void }) {
  const c = r.condition;
  const cc = r.cross_checks;
  const band = r.risk_band || "unknown";
  const [copied, setCopied] = useState(false);

  const groups = PROV_ORDER.map((src) => ({ src, items: r.findings.filter((f) => f.source === src) }));
  // "Record verified" only when the record really came from a live authoritative source.
  const labels = {
    observed: PROV.observed.label,
    record: r.rc_verified ? "Record verified" : "Record · simulated",
    inferred: PROV.inferred.label,
    not_checked: PROV.not_checked.label,
  } as Record<EvidenceSource, string>;

  // Prioritised buyer checklist: highest-impact findings first, one line per distinct action.
  const checklist = useMemo(() => {
    const seen = new Set<string>();
    return [...r.findings]
      .filter((f) => f.next_action)
      .sort((a, b) => b.points - a.points || SEV_RANK[b.severity] - SEV_RANK[a.severity])
      .filter((f) => (seen.has(f.next_action) ? false : (seen.add(f.next_action), true)));
  }, [r.findings]);

  async function copyLink() {
    const url = `${window.location.origin}${window.location.pathname}?r=${encodeURIComponent(r.share_id)}`;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { window.prompt("Copy this report link:", url); }
  }

  return (
    <div className="card report enter">
      <DataBanners r={r} />

      <div className="riskhead">
        <div className={"ring ring-" + band} style={{ "--deg": `${r.risk_score * 3.6}deg` } as CSSProperties}>
          <div className="ring-inner">
            <span className="score">{r.risk_score}</span>
            <span className="scorelabel">/ 100</span>
          </div>
        </div>
        <div className="riskmeta">
          <div className={"band band-" + band}><i className="dot" />{BAND[band]}</div>
          <div className="summary">{c.overall_summary}</div>
          <Breakdown r={r} />
          {band === "low" && (
            <p className="not-clear">
              <b>Not an all‑clear.</b> A low score only means few problems were visible or recorded —
              accident history and hidden mechanical condition were not checked.
            </p>
          )}
        </div>
      </div>

      <section>
        <h3>Findings — each traced to its source</h3>
        <div className="legend">
          {PROV_ORDER.map((k) => (
            <Pill key={k} variant={"prov-" + k} title={PROV[k].blurb}>{labels[k]}</Pill>
          ))}
        </div>
        {groups.map(({ src, items }) =>
          items.length === 0 ? null : (
            <div key={src} className="finding-group">
              <h4 className={"group-" + src}>
                {groupTitle(src)} <span className="count">{items.length}</span>
              </h4>
              {items.map((f, i) => <FindingCard key={i} f={f} photos={photos} label={labels[f.source]} />)}
            </div>
          )
        )}
      </section>

      <section>
        <h3>What to check before paying</h3>
        <ol className="checklist">
          {checklist.map((f, i) => (
            <li key={i}>
              <span className="check-text">{f.next_action}</span>
              <span className="check-meta">
                <Pill variant={"prov-" + f.source}>{labels[f.source]}</Pill>
                <span className="check-why">{f.title}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3>
          Registration record
          <span className={"src-tag " + (r.vahan_mode === "live" && r.rc.available ? "live" : "sim")}>
            {!r.rc.available ? "NOT VERIFIED" : r.vahan_mode === "live" ? "VAHAN · live" : "SIMULATED — NOT GOVERNMENT VERIFIED"}
          </span>
        </h3>
        {r.rc.available ? (
          <div className="grid">
            <Field k="Registration" v={r.rc.reg_number} />
            <Field k="Make / Model" v={`${r.rc.make} ${r.rc.model}`} />
            {r.claimed_make_model && (
              <Field k="Seller's listing says" v={r.claimed_make_model} bad={cc.make_model_match === false} />
            )}
            <Field k="Registered" v={r.rc.reg_date} />
            <Field k="Insurance valid until" v={r.rc.insurance_valid_until} bad={cc.insurance_expired === true} />
            <Field k="Loan / financier" v={r.rc.financier || "None"} bad={cc.under_loan === true} />
            <Field k="Pending challans" v={String(r.rc.challans)} bad={r.rc.challans > 0} />
            <Field k="Blacklisted" v={r.rc.blacklisted ? "YES" : "No"} bad={r.rc.blacklisted} />
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-title">No registration data for {r.rc.reg_number || "this vehicle"}</div>
            <p>{r.rc.note} Insurance, loan, challan and blacklist status are <b>unknown</b> — not “clear”.</p>
          </div>
        )}
      </section>

      <section>
        <h3>Visible condition</h3>
        <div className="chips">
          <span className="chip">Rust {sevBadge(c.rust_level)}</span>
          <span className="chip">Tyre wear {sevBadge(c.tyre_wear)}</span>
          {c.visible_odometer_reading && <span className="chip">Odometer: <b>{c.visible_odometer_reading}</b></span>}
        </div>
        {c.interior_condition && <p className="interior"><b>Interior:</b> {c.interior_condition}</p>}
      </section>

      <Methodology r={r} />
      {r.audit && r.audit.length > 0 && <AuditTrail events={r.audit} />}

      <div className="report-actions">
        <button type="button" className="btn btn-secondary" onClick={copyLink}>
          {copied ? <><CheckIcon /> Link copied</> : "Copy report link"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onNew}>Verify another car</button>
        <span className="share">Saved report <code>{r.share_id}</code> · {new Date(r.created_at).toLocaleString()}</span>
      </div>
    </div>
  );
}

/** One banner per source that is not live & verified — simulation is never subtle. */
function DataBanners({ r }: { r: VerificationResult }) {
  const banners: ReactNode[] = [];
  if (r.gemini_mode !== "live") {
    banners.push(
      <div key="g" className="alert alert-warn"><WarnIcon />
        <span><b>SIMULATED PHOTO ANALYSIS.</b> Visible-condition findings below are mock data, not an analysis of your photos.</span></div>
    );
  }
  if (!r.rc.available) {
    banners.push(
      <div key="rc" className="alert alert-warn"><WarnIcon />
        <span><b>Registration record not available — NOT VERIFIED.</b> Insurance, loan, challans and blacklist status are unknown.</span></div>
    );
  } else if (!r.rc_verified) {
    banners.push(
      <div key="rc" className="alert alert-warn"><WarnIcon />
        <span><b>SIMULATED — NOT GOVERNMENT VERIFIED.</b> The registration details are synthetic test data, shown only to demonstrate the record check.</span></div>
    );
  }
  if (banners.length === 0) {
    banners.push(
      <div key="live" className="alert alert-live"><CheckIcon />
        <span><b>Live data.</b> Condition from Gemini; registration from a live authoritative source. Still a red‑flag triage — <b>not a certification</b>.</span></div>
    );
  }
  return <div className="banners">{banners}</div>;
}

function Breakdown({ r }: { r: VerificationResult }) {
  const b = r.score_breakdown;
  const segs = [
    { key: "observed", k: "Visible condition", v: b.visible_condition },
    { key: "record", k: "Record", v: b.record },
    { key: "not_checked", k: "Uncertainty", v: b.uncertainty },
  ].filter((s) => s.v > 0);
  return (
    <div className="breakdown">
      <div className="bar" title="How the risk score is composed">
        {segs.length === 0
          ? <div className="seg seg-ok" style={{ width: "100%" }} />
          : segs.map((s, i) => <div key={i} className={"seg seg-" + s.key} style={{ width: `${s.v}%` }} title={`${s.k}: +${s.v}`} />)}
      </div>
      <div className="bar-legend">
        {segs.length === 0
          ? <span>no risk points added</span>
          : segs.map((s, i) => <span key={i}><i className={"ldot seg-" + s.key} /> {s.k} +{s.v}</span>)}
        <span className="meta-inline">confidence {(r.condition.overall_confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function FindingCard({ f, photos, label }: { f: Finding; photos: string[]; label: string }) {
  const n = Number(/^Photo (\d+)/.exec(f.evidence)?.[1] ?? 0);
  const src = n > 0 ? photos[n - 1] : undefined;
  return (
    <div className={"finding prov-" + f.source + (src ? " has-photo" : "")}>
      {src && <img className="finding-photo" src={src} alt={`Photo ${n} — evidence for: ${f.title}`} />}
      <div className="finding-head">
        <Pill variant={"prov-" + f.source}>{label}</Pill>
        <span className="finding-title">{f.title}</span>
        <span className="spacer" />
        {f.severity !== "none" && sevBadge(f.severity)}
        {f.points > 0 && <span className="points">+{f.points}</span>}
      </div>
      {f.detail && <div className="finding-detail">{f.detail}</div>}
      <div className="finding-evidence">
        <b>Evidence:</b> {f.evidence}
        {f.source !== "record" && <> · <b>confidence</b> {(f.confidence * 100).toFixed(0)}%</>}
      </div>
      {f.next_action && <div className="finding-action">→ {f.next_action}</div>}
    </div>
  );
}

function Methodology({ r }: { r: VerificationResult }) {
  return (
    <details className="disclose">
      <summary>How this score is calculated — deterministic, same inputs give the same score</summary>
      <p className="muted-p">
        Score = visible-condition points + record points + uncertainty points, clamped to 0–100.
        No AI chooses the number; these fixed rules do:
      </p>
      <ul className="rules">{r.score_breakdown.rules.map((rule, i) => <li key={i}>{rule}</li>)}</ul>
    </details>
  );
}

function AuditTrail({ events }: { events: AuditEvent[] }) {
  return (
    <details className="disclose">
      <summary>Audit trail — how this report was produced ({events.length} steps)</summary>
      <table className="audit">
        <tbody>
          {events.map((e, i) => (
            <tr key={i}>
              <td className="muted">{e.ts.replace("T", " ").slice(0, 19)}</td>
              <td><b>{e.step}</b></td>
              <td>{e.status}</td>
              <td className="muted">{e.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function groupTitle(src: EvidenceSource): string {
  return {
    observed: "Observed in your photos",
    record: "Authoritative RC record",
    inferred: "Inferred from the record",
    not_checked: "Not checked — get these inspected",
  }[src];
}

function Field({ k, v, bad }: { k: string; v: string; bad?: boolean }) {
  return (
    <div className={"field" + (bad ? " bad" : "")}>
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}

/* ---- inline icons (consistent stroke set) ---- */
function UploadIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V5M7 10l5-5 5 5M5 19h14" /></svg>;
}
function WarnIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>;
}
function CheckIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>;
}
function SunIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}
function MoonIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>;
}
