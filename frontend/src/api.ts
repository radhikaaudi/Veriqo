// Production: same origin (Cloud Run serves the app AND /api). Dev: the local backend.
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ??
  (import.meta.env.DEV ? "http://localhost:8080" : "");

export type Severity = "none" | "minor" | "moderate" | "severe";

export type EvidenceSource = "observed" | "record" | "inferred" | "not_checked";

export interface DamageItem {
  location: string;
  type: string;
  severity: Severity;
  note: string;
  photo_number: number;
}

export interface Finding {
  title: string;
  detail: string;
  source: EvidenceSource;
  severity: Severity;
  confidence: number;
  evidence: string;
  next_action: string;
  points: number;
}

export interface ScoreBreakdown {
  visible_condition: number;
  record: number;
  uncertainty: number;
  total: number;
  rules: string[];
}

export interface AuditEvent {
  ts: string;
  step: string;
  status: string;
  detail: string;
}

export interface ConditionReport {
  overall_summary: string;
  damage: DamageItem[];
  rust_level: Severity;
  tyre_wear: Severity;
  interior_condition: string;
  visible_odometer_reading: string;
  red_flags: string[];
  inspect_professionally: string[];
  overall_confidence: number;
  views_covered: string[];
}

export interface RcRecord {
  reg_number: string;
  available: boolean;
  note: string;
  make: string;
  model: string;
  reg_date: string;
  fuel: string;
  insurance_valid_until: string;
  financier: string;
  challans: number;
  blacklisted: boolean;
  rto: string;
  source: string;
}

export interface CrossChecks {
  make_model_match: boolean | null;
  insurance_expired: boolean | null;
  under_loan: boolean | null;
  blacklisted: boolean | null;
  notes: string[];
}

export interface VerificationResult {
  id: string;
  share_id: string;
  created_at: string;
  reg_number: string;
  claimed_make_model: string;
  condition: ConditionReport;
  rc: RcRecord;
  cross_checks: CrossChecks;
  findings: Finding[];
  score_breakdown: ScoreBreakdown;
  risk_score: number;
  risk_band: "low" | "medium" | "high" | "unknown";
  red_flags: string[];
  rc_verified: boolean;
  photo_uris: string[];
  gemini_mode: string;
  vahan_mode: string;
  audit?: AuditEvent[];
}

/** Turn any failure into one sentence a buyer can act on (never a raw stack or JSON blob). */
async function errorFrom(res: Response): Promise<Error> {
  let detail = "";
  try {
    const body = await res.json();
    detail = typeof body.detail === "string"
      ? body.detail
      : Array.isArray(body.detail) ? "Please add a registration number and at least one photo." : "";
  } catch { /* non-JSON */ }
  return new Error(detail || `Something went wrong (HTTP ${res.status}). Please try again.`);
}

async function call(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init);
  } catch {
    throw new Error("Can't reach the Veriqo server. Check your connection and try again — nothing was submitted.");
  }
}

export async function verify(
  regNumber: string,
  photos: File[],
  claimedMakeModel = ""
): Promise<VerificationResult> {
  const form = new FormData();
  form.append("reg_number", regNumber);
  form.append("claimed_make_model", claimedMakeModel);
  photos.forEach((p) => form.append("photos", p));
  const res = await call(`${API_BASE}/api/verify`, { method: "POST", body: form });
  if (!res.ok) throw await errorFrom(res);
  return res.json();
}

export async function getReport(shareId: string): Promise<VerificationResult> {
  const res = await call(`${API_BASE}/api/report/${encodeURIComponent(shareId)}`);
  if (!res.ok) throw res.status === 404 ? new Error("That report link wasn't found. It may be mistyped.") : await errorFrom(res);
  return res.json();
}
