"""Quick smoke test of the core pipeline in mock mode (no cloud deps needed).
Run: python smoke_test.py"""
import gemini
import scoring
import vahan
from models import EvidenceSource, VerificationResult
from store import MemoryStore


def run(reg: str):
    condition = gemini.extract_condition([b"fake-bytes"], ["image/jpeg"])
    rc = vahan.fetch_rc(reg)
    cc = scoring.cross_check(condition, rc)
    findings, breakdown, score, band, flags = scoring.assess(condition, cc, rc)

    # --- auditability guarantees the whole pitch rests on ---
    assert findings, "there should always be at least some findings"
    assert all(f.source in EvidenceSource for f in findings), "every finding must carry a provenance"
    assert all(f.evidence for f in findings), "every finding must cite its evidence"
    # the score is nothing more than the sum of its dimensions
    assert breakdown.total == max(0, min(100, breakdown.visible_condition + breakdown.record + breakdown.uncertainty))
    # and each dimension is the sum of its findings' points — no hidden numbers
    observed_pts = sum(f.points for f in findings if f.source == EvidenceSource.observed)
    assert observed_pts == breakdown.visible_condition, "visible dimension must equal its findings' points"

    result = VerificationResult(
        reg_number=rc.reg_number, condition=condition, rc=rc, cross_checks=cc,
        findings=findings, score_breakdown=breakdown,
        risk_score=score, risk_band=band, red_flags=flags,
        rc_verified=(rc.source == "live"),
        photo_uris=["local://photo/0"], gemini_mode="mock", vahan_mode=rc.source,
    )
    store = MemoryStore()
    saved = store.save(result)
    fetched = store.get_by_share(saved.share_id)
    audit = store.get_audit(saved.id)
    assert fetched is not None, "report should be retrievable by share_id"
    assert audit and audit[0]["step"] == "created", "audit trail should exist"
    assert result.rc_verified is False, "mock RC must never be labelled verified"

    src_counts = {s.value: sum(1 for f in findings if f.source == s) for s in EvidenceSource}
    print(f"\nREG {reg}  ->  risk={score} ({band})  "
          f"[visible={breakdown.visible_condition} record={breakdown.record} uncertain={breakdown.uncertainty}]")
    print(f"  findings by source: {src_counts}")
    print("  top red_flags:", flags[:3])
    print("  rc_verified:", result.rc_verified, "| share_id:", saved.share_id, "| audit events:", len(audit))
    return score, band


if __name__ == "__main__":
    s1, b1 = run("MH01AB1234")   # ends even -> clean-ish
    s2, b2 = run("MH01AB1237")   # ends odd  -> issues (expired insurance + loan + challans)
    assert s2 > s1, "risky reg should score higher than clean reg"
    assert b2 in ("medium", "high"), "risky reg should not be low risk"
    print("\nALL SMOKE CHECKS PASSED")
