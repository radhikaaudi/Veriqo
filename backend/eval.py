"""Honest evaluation harness for Veriqo's DETERMINISTIC decision layer.

Why this exists: a hackathon score that is asserted ("9/10!") is worth nothing; a score
that is *measured against a documented, labelled test set* is evidence. This harness runs
`eval_cases.json` through the real cross-check + scoring code and reports, per case:
  - did the authoritative cross-checks (insurance/loan/blacklist) come out as labelled?
  - did the risk band land where expected?
  - were the right evidence sources present?
It also times each case (latency matters for the 60-second promise).

SCOPE — stated plainly: this evaluates the deterministic layer only. It does NOT measure
Gemini's visual accuracy, which requires a labelled set of real photos run with
GEMINI_MODE=live and human-verified ground truth. We do not manufacture that number.

Run:  python eval.py
"""
from __future__ import annotations

import json
import time
from datetime import date, datetime
from pathlib import Path

import scoring
from models import ConditionReport, DamageItem, EvidenceSource, RcRecord, Severity

CASES_FILE = Path(__file__).with_name("eval_cases.json")


def _condition(d: dict) -> ConditionReport:
    return ConditionReport(
        overall_summary=d.get("overall_summary", ""),
        damage=[DamageItem(**x) for x in d.get("damage", [])],
        rust_level=Severity(d.get("rust_level", "none")),
        tyre_wear=Severity(d.get("tyre_wear", "none")),
        overall_confidence=float(d.get("overall_confidence", 0.6)),
        views_covered=d.get("views_covered", []),
    )


def _rc(d: dict) -> RcRecord:
    return RcRecord(
        reg_number=d.get("reg_number", ""),
        available=bool(d.get("available", True)),
        make=d.get("make", ""),
        model=d.get("model", ""),
        insurance_valid_until=d.get("insurance_valid_until", ""),
        financier=d.get("financier", ""),
        challans=int(d.get("challans", 0)),
        blacklisted=bool(d.get("blacklisted", False)),
        source="mock",
    )


def main() -> int:
    spec = json.loads(CASES_FILE.read_text())
    today = datetime.strptime(spec["as_of"], "%Y-%m-%d").date()
    cases = spec["cases"]

    print("=" * 74)
    print("Veriqo — deterministic decision-layer evaluation")
    print(f"test set: {CASES_FILE.name}  ·  {len(cases)} labelled cases  ·  as-of {today}")
    print("=" * 74)

    total_checks = passed_checks = 0
    failed_cases: list[str] = []
    latencies: list[float] = []

    for c in cases:
        condition, rc, exp = _condition(c["condition"]), _rc(c["rc"]), c["expect"]

        t0 = time.perf_counter()
        claimed = c.get("claimed_make_model", "")
        cc = scoring.cross_check(condition, rc, today=today, claimed_make_model=claimed)
        findings, breakdown, _score, band, _flags = scoring.assess(condition, cc, rc, claimed)
        latencies.append((time.perf_counter() - t0) * 1000)

        checks: list[tuple[str, bool]] = [
            ("insurance_expired", cc.insurance_expired == exp["insurance_expired"]),
            ("under_loan", cc.under_loan == exp["under_loan"]),
            ("blacklisted", cc.blacklisted == exp["blacklisted"]),
            ("band", band == exp["band"]),
        ]
        present = {f.source.value for f in findings}
        for s in exp.get("sources_present", []):
            checks.append((f"source:{s}", s in present))
        for s in exp.get("sources_absent", []):
            checks.append((f"no-source:{s}", s not in present))
        if "make_model_match" in exp:
            checks.append(("make_model_match", cc.make_model_match == exp["make_model_match"]))
        titles = " | ".join(f.title.lower() for f in findings)
        for t in exp.get("titles_contain", []):
            checks.append((f"title:{t}", t.lower() in titles))
        if "uncertainty_gt" in exp:
            checks.append(("uncertainty>0", breakdown.uncertainty > exp["uncertainty_gt"]))

        case_ok = all(ok for _, ok in checks)
        total_checks += len(checks)
        passed_checks += sum(1 for _, ok in checks if ok)
        if not case_ok:
            failed_cases.append(c["name"])

        mark = "PASS" if case_ok else "FAIL"
        print(f"\n[{mark}] {c['name']}")
        print(f"       band={band} (want {exp['band']})  "
              f"score dims: visible={breakdown.visible_condition} record={breakdown.record} "
              f"uncertainty={breakdown.uncertainty}  total={breakdown.total}")
        print(f"       sources present: {sorted(present)}")
        for name, ok in checks:
            if not ok:
                print(f"         ✗ check failed: {name}")

    print("\n" + "=" * 74)
    print(f"checks passed : {passed_checks}/{total_checks}  "
          f"({100 * passed_checks / total_checks:.0f}%)")
    print(f"cases passed  : {len(cases) - len(failed_cases)}/{len(cases)}"
          + (f"  (failed: {', '.join(failed_cases)})" if failed_cases else ""))
    print(f"latency       : avg {sum(latencies) / len(latencies):.2f} ms  ·  "
          f"max {max(latencies):.2f} ms  (deterministic layer only, excludes Gemini/VAHAN network)")
    print("\nNOT evaluated here: Gemini visual-detection accuracy. That needs a labelled")
    print("photo set + GEMINI_MODE=live + human-verified ground truth, reported as")
    print("per-defect precision/recall. We do not report a visual-accuracy number we")
    print("have not actually measured.")
    print("=" * 74)
    return 1 if failed_cases else 0


if __name__ == "__main__":
    raise SystemExit(main())
