import { useState } from "react";
import {
  verify,
  VerificationResult,
  Severity,
  EvidenceSource,
  Finding,
  AuditEvent,
} from "./api";

const bandColor: Record<string, string> = {
  low: "#1a7f37",
  medium: "#b26a00",
  high: "#b42318",
  unknown: "#555",
};

// The whole pitch in one object: every finding is one of these four, and the UI
// never blurs the line between what was seen, recorded, inferred, or not checked.
const PROVENANCE: Record<EvidenceSource, { icon: string; label: string; color: string; blurb: string }> = {
  observed:    { icon: "👁", label: "Observed",    color: "#3b82f6", blurb: "Seen in your photos (Gemini vision)" },
  record:      { icon: "📋", label: "Record",      color: "#8b5cf6", blurb: "Read directly from the RC record" },
  inferred:    { icon: "🔗", label: "Inferred",    color: "#0891b2", blurb: "Deterministic logic over the record" },
  not_checked: { icon: "❓", label: "Not checked", color: "#64748b", blurb: "Out of scope — surfaced, never scored" },
};

function sevBadge(s: Severity) {
  const color = { none: "#1a7f37", minor: "#8a8a00", moderate: "#b26a00", severe: "#b42318" }[s];
  return <span className="sev" style={{ background: color }}>{s}</span>;
}

export default function App() {
  const [reg, setReg] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!reg.trim()) return setError("Enter the vehicle registration number.");
    if (photos.length === 0) return setError("Add at least one photo of the car.");
    setLoading(true);
    try {
      setResult(await verify(reg.trim(), photos));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="wrap">
      <header>
        <h1>Veriqo</h1>
        <p className="tag">Verify any used car in 60 seconds — before you pay anyone.</p>
      </header>

      <form className="card" onSubmit={onSubmit}>
        <label>Registration number</label>
        <input
          value={reg}
          onChange={(e) => setReg(e.target.value.toUpperCase())}
          placeholder="e.g. MH01AB1234"
        />

        <label>Car photos (exterior panels, tyres, interior, odometer)</label>
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setPhotos(Array.from(e.target.files ?? []))}
        />
        {photos.length > 0 && <small>{photos.length} photo(s) selected</small>}

        <button disabled={loading}>{loading ? "Analyzing…" : "Verify car"}</button>
        {error && <p className="error">{error}</p>}
      </form>

      {result && <Report r={result} />}

      <footer>
        <p>
          Veriqo is a <b>red-flag triage</b>, not a certification. Every flag below is tagged with
          where it came from — <b>observed</b> in your photos, read from the <b>record</b>,
          <b> inferred</b> by deterministic rules, or honestly marked <b>not checked</b>.
        </p>
      </footer>
    </div>
  );
}

function Report({ r }: { r: VerificationResult }) {
  const c = r.condition;
  const cc = r.cross_checks;
  const isMock = !r.rc_verified || r.gemini_mode !== "live";

  const groups: { src: EvidenceSource; items: Finding[] }[] = (
    ["observed", "record", "inferred", "not_checked"] as EvidenceSource[]
  ).map((src) => ({ src, items: r.findings.filter((f) => f.source === src) }));

  return (
    <div className="card report">
      <DataBanner r={r} isMock={isMock} />

      <div className="riskhead" style={{ borderColor: bandColor[r.risk_band] }}>
        <div>
          <div className="score" style={{ color: bandColor[r.risk_band] }}>{r.risk_score}</div>
          <div className="scorelabel">risk / 100</div>
        </div>
        <div style={{ flex: 1 }}>
          <div className="band" style={{ color: bandColor[r.risk_band] }}>
            {r.risk_band.toUpperCase()} RISK
          </div>
          <div className="summary">{c.overall_summary}</div>
          <Breakdown r={r} />
        </div>
      </div>

      {/* Evidence-tagged findings — the core of Veriqo */}
      <section>
        <h3>Findings — each traced to its source</h3>
        <div className="legend">
          {Object.entries(PROVENANCE).map(([k, v]) => (
            <span key={k} className="legend-item" title={v.blurb}>
              <span className="prov" style={{ background: v.color }}>{v.icon} {v.label}</span>
            </span>
          ))}
        </div>
        {groups.map(({ src, items }) =>
          items.length === 0 ? null : (
            <div key={src} className="finding-group">
              <h4 style={{ color: PROVENANCE[src].color }}>
                {PROVENANCE[src].icon} {groupTitle(src)} <span className="count">({items.length})</span>
              </h4>
              {items.map((f, i) => <FindingCard key={i} f={f} />)}
            </div>
          )
        )}
      </section>

      <section>
        <h3>Registration record ({r.vahan_mode === "live" ? "VAHAN · live" : "VAHAN · simulated"})</h3>
        <div className="grid">
          <Field k="Make / Model" v={`${r.rc.make} ${r.rc.model}`} />
          <Field k="Registered" v={r.rc.reg_date} />
          <Field k="Insurance valid until" v={r.rc.insurance_valid_until} bad={cc.insurance_expired === true} />
          <Field k="Loan / financier" v={r.rc.financier || "None"} bad={cc.under_loan === true} />
          <Field k="Pending challans" v={String(r.rc.challans)} bad={r.rc.challans > 0} />
          <Field k="Blacklisted" v={r.rc.blacklisted ? "YES" : "No"} bad={r.rc.blacklisted} />
        </div>
      </section>

      <section>
        <h3>Visible condition</h3>
        <div className="chips">
          <span>Rust {sevBadge(c.rust_level)}</span>
          <span>Tyre wear {sevBadge(c.tyre_wear)}</span>
          {c.visible_odometer_reading && <span>Odometer: {c.visible_odometer_reading}</span>}
        </div>
        {c.interior_condition && <p><b>Interior:</b> {c.interior_condition}</p>}
      </section>

      <Methodology r={r} />
      {r.audit && r.audit.length > 0 && <AuditTrail events={r.audit} />}

      <p className="share">Shareable report id: <code>{r.share_id}</code></p>
    </div>
  );
}

function DataBanner({ r, isMock }: { r: VerificationResult; isMock: boolean }) {
  if (!isMock) {
    return (
      <div className="banner live">
        ✅ <b>Live data.</b> Condition from Gemini; RC from a live authoritative source. Still a
        red-flag triage — <b>not a certification</b>.
      </div>
    );
  }
  const parts = [
    r.gemini_mode !== "live" ? "photo analysis (Gemini mock)" : null,
    !r.rc_verified ? "RC record (simulated — not government-verified)" : null,
  ].filter(Boolean);
  return (
    <div className="banner mock">
      ⚠️ <b>SIMULATED DATA — demo mode.</b> This report contains mock {parts.join(" and ")}. It is{" "}
      <b>not government-verified</b> and is shown only to demonstrate the pipeline. Flip
      <code> GEMINI_MODE</code>/<code>VAHAN_MODE</code> to <code>live</code> for real data.
    </div>
  );
}

function Breakdown({ r }: { r: VerificationResult }) {
  const b = r.score_breakdown;
  const segs = [
    { k: "Visible condition", v: b.visible_condition, color: PROVENANCE.observed.color },
    { k: "Record", v: b.record, color: PROVENANCE.record.color },
    { k: "Uncertainty", v: b.uncertainty, color: PROVENANCE.not_checked.color },
  ].filter((s) => s.v > 0);
  return (
    <div className="breakdown">
      <div className="bar" title="How the risk score is composed">
        {segs.length === 0 ? (
          <div className="seg" style={{ width: "100%", background: "#1a7f37" }} />
        ) : (
          segs.map((s, i) => (
            <div key={i} className="seg" style={{ width: `${s.v}%`, background: s.color }} title={`${s.k}: +${s.v}`} />
          ))
        )}
      </div>
      <div className="bar-legend">
        {segs.length === 0
          ? <span>no risk points added</span>
          : segs.map((s, i) => (
              <span key={i}><i style={{ background: s.color }} /> {s.k} +{s.v}</span>
            ))}
        <span className="meta-inline">confidence {(r.condition.overall_confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  );
}

function FindingCard({ f }: { f: Finding }) {
  const p = PROVENANCE[f.source];
  return (
    <div className="finding" style={{ borderLeftColor: p.color }}>
      <div className="finding-head">
        <span className="prov" style={{ background: p.color }}>{p.icon} {p.label}</span>
        <span className="finding-title">{f.title}</span>
        <span className="spacer" />
        {f.severity !== "none" && sevBadge(f.severity)}
        {f.points > 0 && <span className="points">+{f.points}</span>}
      </div>
      {f.detail && <div className="finding-detail">{f.detail}</div>}
      <div className="finding-evidence"><b>Evidence:</b> {f.evidence}
        {f.source !== "record" && <> · <b>confidence</b> {(f.confidence * 100).toFixed(0)}%</>}
      </div>
      {f.next_action && <div className="finding-action">→ {f.next_action}</div>}
    </div>
  );
}

function Methodology({ r }: { r: VerificationResult }) {
  return (
    <details className="disclose">
      <summary>How this score is calculated (deterministic — same inputs, same score)</summary>
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
    not_checked: "Not checked (get these inspected)",
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
