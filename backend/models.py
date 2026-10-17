"""Pydantic models. ConditionReport doubles as the Gemini structured-output schema."""
from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, ConfigDict, Field


class Severity(str, Enum):
    none = "none"
    minor = "minor"
    moderate = "moderate"
    severe = "severe"


class EvidenceSource(str, Enum):
    """Where a finding comes from — the core of Veriqo's auditability.

    Every conclusion is traceable to exactly one of these, so the UI (and a judge)
    can tell a photo observation apart from an authoritative record, apart from a
    deterministic inference, apart from something we honestly did NOT check.
    """
    observed = "observed"        # seen in the buyer's photos (Gemini vision)
    record = "record"            # a field read directly from the authoritative RC record
    inferred = "inferred"        # deterministic logic combining record + rules (e.g. date math)
    not_checked = "not_checked"  # declared out of scope / unverifiable here — surfaced, never scored away


class DamageItem(BaseModel):
    location: str = Field(description="Panel/part, e.g. 'front bumper', 'left rear door'")
    type: str = Field(description="dent | scratch | rust | crack | paint_mismatch | missing_part | other")
    severity: Severity = Severity.minor
    note: str = Field(default="", description="Short human-readable detail")


class ConditionReport(BaseModel):
    """What Gemini returns from the photos. VISIBLE evidence only — never mechanical guesses."""
    overall_summary: str = Field(description="2-3 sentence plain-language summary of visible condition")
    damage: list[DamageItem] = Field(default_factory=list)
    rust_level: Severity = Severity.none
    tyre_wear: Severity = Severity.none
    interior_condition: str = Field(default="", description="Visible interior condition")
    visible_odometer_reading: str = Field(default="", description="Odometer value if legible in a photo, else empty")
    red_flags: list[str] = Field(default_factory=list, description="Visible issues a buyer should worry about")
    inspect_professionally: list[str] = Field(
        default_factory=list,
        description="Specific things a mechanic must check (anything not verifiable from photos)",
    )
    overall_confidence: float = Field(default=0.5, description="0..1 confidence in this visual assessment")


class RcRecord(BaseModel):
    reg_number: str
    make: str = ""
    model: str = ""
    reg_date: str = ""
    fuel: str = ""
    insurance_valid_until: str = ""   # ISO date or "" if unknown
    financier: str = ""               # non-empty => active hypothecation/loan
    challans: int = 0
    blacklisted: bool = False
    rto: str = ""
    source: str = "mock"              # honesty label: mock | live


class CrossChecks(BaseModel):
    # avoid pydantic 'model_' protected-namespace warning
    model_config = ConfigDict(protected_namespaces=())
    make_model_match: bool | None = None
    insurance_expired: bool | None = None
    under_loan: bool | None = None
    blacklisted: bool | None = None
    notes: list[str] = Field(default_factory=list)


class Finding(BaseModel):
    """One evidence-linked conclusion. This is the unit that makes Veriqo auditable:
    every red flag is a Finding that names its source, its supporting evidence, how much
    it moved the risk score, and what the buyer should do next."""
    title: str = Field(description="Short headline, e.g. 'Active loan on the vehicle'")
    detail: str = Field(default="", description="One-line explanation for a non-expert")
    source: EvidenceSource
    severity: Severity = Severity.minor
    confidence: float = Field(default=1.0, description="0..1 — RC facts ≈1.0; photo observations use Gemini's confidence")
    evidence: str = Field(default="", description="What backs this: the photo panel, or the RC field=value it was read from")
    next_action: str = Field(default="", description="The concrete thing the buyer should do about it")
    points: int = Field(default=0, description="How many points this finding contributed to the risk score (auditable)")


class ScoreBreakdown(BaseModel):
    """The risk score, decomposed. Addresses 'the score is a mystery number' — each
    dimension is the sum of its findings' points, and `rules` lists the fixed weights applied."""
    model_config = ConfigDict(protected_namespaces=())
    visible_condition: int = 0   # points from OBSERVED photo findings
    record: int = 0              # points from RECORD + INFERRED (authoritative) findings
    uncertainty: int = 0         # points from low confidence / unverified items
    total: int = 0               # == risk_score, clamped 0..100
    rules: list[str] = Field(default_factory=list, description="The fixed, human-readable scoring rules applied")


class VerificationResult(BaseModel):
    id: str = ""
    share_id: str = ""
    created_at: str = ""
    reg_number: str = ""
    condition: ConditionReport
    rc: RcRecord
    cross_checks: CrossChecks
    findings: list[Finding] = Field(default_factory=list)          # evidence-linked, provenance-tagged
    score_breakdown: ScoreBreakdown = Field(default_factory=ScoreBreakdown)
    risk_score: int = 0               # 0..100 (higher = riskier) — DETERMINISTIC
    risk_band: str = "unknown"        # low | medium | high
    red_flags: list[str] = Field(default_factory=list)            # kept as a quick summary, derived from findings
    rc_verified: bool = False         # TRUE only when the RC came from a LIVE authoritative source
    photo_uris: list[str] = Field(default_factory=list)
    gemini_mode: str = "mock"
    vahan_mode: str = "mock"
