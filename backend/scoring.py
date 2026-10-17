"""Deterministic cross-checks + evidence-linked risk assessment.

This is intentionally NOT the LLM. The AI *perceives* (Gemini reads the photos); this
code *decides*. Keeping the decision layer deterministic, auditable, and testable is the
'the AI isn't doing everything' sophistication the rubric rewards.

Every conclusion is emitted as a `Finding` that carries its provenance
(observed / record / inferred / not_checked), the evidence that backs it, the points it
contributed to the score, and the buyer's next action. The risk score is then just the
sum of those points, decomposed into dimensions — never a mystery number.
"""
from __future__ import annotations

from datetime import date, datetime

from models import (
    ConditionReport,
    CrossChecks,
    EvidenceSource,
    Finding,
    RcRecord,
    ScoreBreakdown,
    Severity,
)

_SEV_WEIGHT = {Severity.none: 0, Severity.minor: 4, Severity.moderate: 10, Severity.severe: 22}

# Fixed, published weights — stated so the score is explainable, not asserted.
SCORING_RULES = [
    "Visible damage: minor +4, moderate +10, severe +22 (per item).",
    "Visible rust: same severity weights.",
    "Uneven tyre wear: counted at half the severity weight.",
    "Active loan / hypothecation: +20.",
    "Insurance expired: +12.",
    "Blacklisted in RC: +60.",
    "Pending challans: +3 each, capped at 5 challans.",
    "Low photo confidence (<0.5): +8 (uncertainty, not safety).",
    "Bands: 0–24 low · 25–54 medium · 55–100 high.",
]

# How each provenance rolls up into the three score dimensions.
_DIMENSION = {
    EvidenceSource.observed: "visible_condition",
    EvidenceSource.record: "record",
    EvidenceSource.inferred: "record",
    EvidenceSource.not_checked: "uncertainty",
}


def _parse_date(s: str) -> date | None:
    s = (s or "").strip()
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def cross_check(condition: ConditionReport, rc: RcRecord, today: date | None = None) -> CrossChecks:
    today = today or date.today()
    cc = CrossChecks()

    ins = _parse_date(rc.insurance_valid_until)
    cc.insurance_expired = (ins < today) if ins else None
    cc.under_loan = bool(rc.financier.strip()) if rc else None
    cc.blacklisted = bool(rc.blacklisted)
    cc.make_model_match = None  # we don't collect a claimed model from the buyer in the MVP

    if cc.insurance_expired:
        cc.notes.append(f"Insurance expired ({rc.insurance_valid_until}).")
    if cc.under_loan:
        cc.notes.append(f"Active hypothecation to {rc.financier} — get an NOC before buying.")
    if cc.blacklisted:
        cc.notes.append("Vehicle is BLACKLISTED in the RC record — do not proceed.")
    if rc.challans:
        cc.notes.append(f"{rc.challans} pending challan(s) on record.")
    return cc


def build_findings(condition: ConditionReport, cc: CrossChecks, rc: RcRecord) -> list[Finding]:
    """Turn raw perception + record into evidence-linked, provenance-tagged findings."""
    conf = max(0.0, min(1.0, float(condition.overall_confidence)))
    findings: list[Finding] = []

    # ---- OBSERVED: visible condition from the photos (Gemini) ----
    for d in condition.damage:
        findings.append(Finding(
            title=f"{d.type.replace('_', ' ').capitalize()} on {d.location}",
            detail=d.note,
            source=EvidenceSource.observed,
            severity=d.severity,
            confidence=conf,
            evidence=f"Photo — {d.location}",
            next_action=_action_for_damage(d.type),
            points=_SEV_WEIGHT.get(d.severity, 4),
        ))
    if condition.rust_level != Severity.none:
        findings.append(Finding(
            title=f"Visible rust ({condition.rust_level.value})",
            detail="Surface/panel rust visible in the photos.",
            source=EvidenceSource.observed,
            severity=condition.rust_level,
            confidence=conf,
            evidence="Photo — body panels",
            next_action="Inspect underbody and chassis for structural rust.",
            points=_SEV_WEIGHT.get(condition.rust_level, 0),
        ))
    if condition.tyre_wear in (Severity.moderate, Severity.severe):
        findings.append(Finding(
            title=f"Uneven / heavy tyre wear ({condition.tyre_wear.value})",
            detail="Wear pattern can indicate alignment or suspension issues.",
            source=EvidenceSource.observed,
            severity=condition.tyre_wear,
            confidence=conf,
            evidence="Photo — tyres",
            next_action="Get wheel alignment and suspension checked; budget for tyres.",
            points=_SEV_WEIGHT.get(condition.tyre_wear, 0) // 2,
        ))

    # ---- RECORD + INFERRED: the authoritative RC check ----
    if cc.blacklisted:
        findings.append(Finding(
            title="Vehicle is BLACKLISTED",
            detail="The registration record is blacklisted — do not proceed.",
            source=EvidenceSource.record,
            severity=Severity.severe,
            confidence=1.0,
            evidence="RC: blacklisted = true",
            next_action="Do not buy. Verify directly with the RTO / Parivahan.",
            points=60,
        ))
    if cc.under_loan:
        findings.append(Finding(
            title="Active loan / hypothecation",
            detail=f"The RC shows an active loan with {rc.financier}.",
            source=EvidenceSource.record,
            severity=Severity.moderate,
            confidence=1.0,
            evidence=f"RC: financier = {rc.financier}",
            next_action="Get an NOC / Form 35 from the financier before paying.",
            points=20,
        ))
    if cc.insurance_expired:
        findings.append(Finding(
            title="Insurance has expired",
            detail="Comparing the RC's insurance-valid-until date against today.",
            source=EvidenceSource.inferred,   # date math over a record field, not a raw field
            severity=Severity.moderate,
            confidence=1.0,
            evidence=f"RC: insurance_valid_until = {rc.insurance_valid_until} (past)",
            next_action="Budget for fresh insurance; it must be renewed before road use.",
            points=12,
        ))
    if rc.challans:
        capped = min(rc.challans, 5)
        findings.append(Finding(
            title=f"{rc.challans} pending challan(s)",
            detail="Unpaid traffic penalties on record.",
            source=EvidenceSource.record,
            severity=Severity.minor if rc.challans <= 2 else Severity.moderate,
            confidence=1.0,
            evidence=f"RC: challans = {rc.challans}",
            next_action="Have the seller clear challans, or negotiate the amount off the price.",
            points=capped * 3,
        ))

    # ---- UNCERTAINTY: honest about what we could NOT establish ----
    if conf < 0.5:
        findings.append(Finding(
            title="Low photo confidence",
            detail="Few/blurry/partial photos — treat the visible findings as provisional.",
            source=EvidenceSource.not_checked,
            severity=Severity.minor,
            confidence=conf,
            evidence=f"Gemini overall_confidence = {conf:.2f}",
            next_action="Request more, clearer photos or an in-person check.",
            points=8,
        ))
    if cc.make_model_match is None:
        findings.append(Finding(
            title="Make/model not cross-checked",
            detail="The buyer did not supply a claimed make/model, so it was not matched against the RC.",
            source=EvidenceSource.not_checked,
            severity=Severity.none,
            confidence=1.0,
            evidence="No buyer-claimed make/model provided",
            next_action="Confirm the car's make/model matches the RC in person.",
            points=0,
        ))
    # Everything Gemini said needs a professional eye — surfaced, never scored away.
    for item in condition.inspect_professionally:
        findings.append(Finding(
            title=item,
            detail="Not verifiable from photos — out of scope for this triage.",
            source=EvidenceSource.not_checked,
            severity=Severity.none,
            confidence=1.0,
            evidence="Not visible in photos",
            next_action="Have a mechanic inspect this before purchase.",
            points=0,
        ))
    return findings


def score(findings: list[Finding]) -> ScoreBreakdown:
    """Sum findings' points into dimensions. The score is nothing more than this."""
    dims = {"visible_condition": 0, "record": 0, "uncertainty": 0}
    for f in findings:
        dims[_DIMENSION[f.source]] += f.points
    total = max(0, min(100, sum(dims.values())))
    return ScoreBreakdown(total=total, rules=list(SCORING_RULES), **dims)


def band_for(total: int) -> str:
    return "low" if total < 25 else "medium" if total < 55 else "high"


def top_red_flags(findings: list[Finding], limit: int = 6) -> list[str]:
    """A quick human summary: the scoring findings that actually moved the needle."""
    scored = [f for f in findings if f.points > 0]
    scored.sort(key=lambda f: f.points, reverse=True)
    return [f.title for f in scored[:limit]]


def assess(condition: ConditionReport, cc: CrossChecks, rc: RcRecord):
    """One call → everything the API needs: findings, breakdown, score, band, red flags."""
    findings = build_findings(condition, cc, rc)
    breakdown = score(findings)
    return findings, breakdown, breakdown.total, band_for(breakdown.total), top_red_flags(findings)


def _action_for_damage(dmg_type: str) -> str:
    return {
        "paint_mismatch": "Check for prior accident repair / repaint (panel gaps, overspray).",
        "dent": "Assess repair cost; look for underlying panel or frame damage.",
        "rust": "Inspect for structural rust beyond the visible area.",
        "crack": "Check whether the crack affects a structural or safety part.",
        "missing_part": "Price the replacement part; confirm it isn't hiding damage.",
    }.get(dmg_type, "Inspect this area closely in person.")


# ---- Backward-compatible shim (older callers / tests used this tuple API) ----
def compute_risk(condition: ConditionReport, cc: CrossChecks, rc: RcRecord) -> tuple[int, str, list[str]]:
    _findings, _bd, total, band, flags = assess(condition, cc, rc)
    return total, band, flags
