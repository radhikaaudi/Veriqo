"""API tests for Veriqo (mock Gemini + synthetic RC fixtures + in-memory store).

Run:  cd backend && python -m pytest -q tests/

These exercise the real FastAPI app and the real deterministic rules. They do NOT
measure Gemini's visual accuracy — that is covered by the live test matrix
(test-assets/ + tests/e2e), which uses real photos against the deployed service.
"""
import os
import sys
from pathlib import Path

# Force the offline, deterministic configuration BEFORE importing the app.
os.environ.update({"GEMINI_MODE": "mock", "VAHAN_MODE": "mock", "STORE_MODE": "memory", "GCS_BUCKET": ""})
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import gemini  # noqa: E402
import main  # noqa: E402
import store  # noqa: E402

JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64          # magic bytes are what the API checks
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64


@pytest.fixture()
def client():
    store._store = None                             # fresh in-memory store per test
    return TestClient(main.app)


def post(client, reg="ZZ01TC0001", files=None, claimed=""):
    files = files if files is not None else [("photos", ("car.jpg", JPEG, "image/jpeg"))]
    return client.post("/api/verify", data={"reg_number": reg, "claimed_make_model": claimed}, files=files)


def titles(body):
    return [f["title"] for f in body["findings"]]


# ---------- A/B: happy path, multiple images ----------
def test_report_generated_with_multiple_images(client):
    files = [("photos", (f"p{i}.jpg", JPEG, "image/jpeg")) for i in range(3)] + [("photos", ("p.png", PNG, "image/png"))]
    r = post(client, files=files)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["share_id"] and b["findings"]
    assert {f["source"] for f in b["findings"]} <= {"observed", "record", "inferred", "not_checked"}


# ---------- Score integrity ----------
def capped_total(findings):
    vis = min(60, sum(f["points"] for f in findings if f["source"] == "observed"))
    rest = sum(f["points"] for f in findings if f["source"] != "observed")
    return max(0, min(100, vis + rest))


def test_score_is_exactly_the_sum_of_finding_points(client):
    b = post(client, reg="ZZ01TC0002").json()
    assert b["risk_score"] == capped_total(b["findings"]) == b["score_breakdown"]["total"]


def test_visible_condition_is_capped_at_60():
    import scoring
    from models import ConditionReport, DamageItem, RcRecord, Severity
    many = ConditionReport(overall_summary="x", overall_confidence=0.9,
                           damage=[DamageItem(location=f"panel {i}", type="dent", severity=Severity.severe) for i in range(6)])
    rc = RcRecord(reg_number="ZZ01TC0001", insurance_valid_until="2027-01-01")
    cc = scoring.cross_check(many, rc)
    _f, bd, total, band, _ = scoring.assess(many, cc, rc)
    assert bd.visible_condition == 60 and total == 60 and band == "high"


# ---------- Phase 5: never an all-clear ----------
def test_every_report_lists_history_and_mechanical_as_not_checked(client):
    b = post(client).json()
    nc = [f["title"] for f in b["findings"] if f["source"] == "not_checked"]
    assert any("Accident and service history" in t for t in nc)
    assert any("Hidden mechanical condition" in t for t in nc)


def test_simulated_record_is_never_marked_verified(client):
    b = post(client, reg="ZZ01TC0001").json()
    assert b["rc"]["available"] is True and b["rc"]["source"] == "mock"
    assert b["rc_verified"] is False


# ---------- I: missing / unavailable registration record ----------
def test_unknown_plate_is_not_verified_and_nothing_is_invented(client):
    b = post(client, reg="KA05MG7321").json()
    assert b["rc"]["available"] is False
    assert b["rc"]["make"] == "" and b["rc"]["financier"] == "" and b["rc"]["insurance_valid_until"] == ""
    cc = b["cross_checks"]
    assert cc["insurance_expired"] is None and cc["under_loan"] is None and cc["blacklisted"] is None
    assert not [f for f in b["findings"] if f["source"] in ("record", "inferred")]
    assert any("not available" in t for t in titles(b))


# ---------- J: conflicting vehicle details ----------
def test_listing_mismatch_is_flagged(client):
    b = post(client, reg="ZZ01TC0004", claimed="Honda City").json()
    assert b["cross_checks"]["make_model_match"] is False
    f = [f for f in b["findings"] if "does not match" in f["title"]]
    assert f and f[0]["source"] == "inferred" and f[0]["points"] == 25


def test_listing_match_is_recorded(client):
    b = post(client, reg="ZZ01TC0004", claimed="Maruti Swift").json()
    assert b["cross_checks"]["make_model_match"] is True


# ---------- H: missing views ----------
def test_missing_coverage_is_flagged(client):
    b = post(client).json()  # mock reports only front + left side
    assert any(t.startswith("Missing photo coverage") for t in titles(b))


# ---------- K: invalid input ----------
def test_non_image_rejected(client):
    r = post(client, files=[("photos", ("notes.txt", b"hello world", "text/plain"))])
    assert r.status_code == 415


def test_text_file_pretending_to_be_jpeg_rejected(client):
    r = post(client, files=[("photos", ("fake.jpg", b"not really a jpeg", "image/jpeg"))])
    assert r.status_code == 415


def test_empty_file_rejected(client):
    r = post(client, files=[("photos", ("empty.jpg", b"", "image/jpeg"))])
    assert r.status_code == 400


def test_oversized_file_rejected(client):
    big = JPEG + b"\x00" * (13 * 1024 * 1024)
    r = post(client, files=[("photos", ("big.jpg", big, "image/jpeg"))])
    assert r.status_code == 413


def test_no_photos_rejected(client):
    r = client.post("/api/verify", data={"reg_number": "ZZ01TC0001"})
    assert r.status_code == 422


def test_too_many_photos_rejected(client):
    files = [("photos", (f"p{i}.jpg", JPEG, "image/jpeg")) for i in range(9)]
    assert post(client, files=files).status_code == 400


# ---------- L: Gemini failure / timeout / rate limit — nothing saved ----------
@pytest.mark.parametrize("exc,code", [
    (RuntimeError("429 RESOURCE_EXHAUSTED quota"), 503),
    (TimeoutError("read timed out"), 504),
    (ValueError("bad response"), 502),
])
def test_gemini_failures_map_to_clear_errors_and_save_nothing(client, monkeypatch, exc, code):
    def boom(*a, **k):
        raise exc
    monkeypatch.setattr(gemini, "extract_condition", boom)
    r = post(client)
    assert r.status_code == code
    assert "Nothing was saved" in r.json()["detail"]
    assert store.get_store()._by_id == {}


# ---------- N: persistence + retrieval ----------
def test_report_can_be_reopened_by_share_id(client):
    b = post(client, reg="ZZ01TC0002").json()
    r = client.get(f"/api/report/{b['share_id']}")
    assert r.status_code == 200
    again = r.json()
    assert again["id"] == b["id"] and again["risk_score"] == b["risk_score"]
    assert [e["step"] for e in again["audit"]] == ["created", "gemini", "vahan", "scoring"]


def test_unknown_report_404(client):
    assert client.get("/api/report/doesnotexist").status_code == 404


# ---------- Q: same inputs => same deterministic result ----------
def test_same_inputs_same_result(client):
    a = post(client, reg="ZZ01TC0002", claimed="Hyundai Verna").json()
    b = post(client, reg="ZZ01TC0002", claimed="Hyundai Verna").json()
    assert a["risk_score"] == b["risk_score"] and titles(a) == titles(b)
