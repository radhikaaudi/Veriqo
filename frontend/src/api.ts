export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, "") ||
  "http://localhost:8080";

export type Severity = "none" | "minor" | "moderate" | "severe";

export type EvidenceSource = "observed" | "record" | "inferred" | "not_checked";

export interface DamageItem {
  location: string;
  type: string;
  severity: Severity;
  note: string;
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
}

export interface RcRecord {
  reg_number: string;
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

export async function verify(
  regNumber: string,
  photos: File[]
): Promise<VerificationResult> {
  const form = new FormData();
  form.append("reg_number", regNumber);
  photos.forEach((p) => form.append("photos", p));

  const res = await fetch(`${API_BASE}/api/verify`, { method: "POST", body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Verification failed (${res.status}): ${txt}`);
  }
  return res.json();
}
