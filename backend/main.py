"""Veriqo API — FastAPI on Cloud Run.

Flow (the compound pattern):
  photos + reg number
    -> Gemini multimodal extraction (condition)
    -> VAHAN RC lookup (authoritative record)
    -> deterministic cross-check + risk score
    -> persist (Firestore) + append-only audit
    -> shareable report
"""
from __future__ import annotations

import config
import gemini
import scoring
import vahan
from gcs import upload_photos
from models import VerificationResult
from store import get_store

import os

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Veriqo API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_PHOTOS = 8
MAX_BYTES = 12 * 1024 * 1024  # 12 MB per image (inline Gemini limit is ~20MB total request)


@app.get("/api/health")   # use this on Cloud Run: paths ending in "z" (e.g. /healthz) are reserved there
@app.get("/healthz")      # kept for local development
def healthz():
    return {
        "status": "ok",
        "gemini_mode": config.GEMINI_MODE,
        "vahan_mode": config.VAHAN_MODE,
        "store_mode": config.STORE_MODE,
        "model": config.GEMINI_MODEL,
    }


def _sniff_image(data: bytes) -> str | None:
    """Identify the image type from its magic bytes — never trust the declared content-type alone."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"heif"):
        return "image/heic"
    return None


@app.post("/api/verify")
async def verify(
    reg_number: str = Form(...),
    photos: list[UploadFile] = File(...),
    claimed_make_model: str = Form(""),
):
    if not reg_number.strip():
        raise HTTPException(400, "Enter the vehicle registration number.")
    if not photos:
        raise HTTPException(400, "At least one photo is required.")
    if len(photos) > MAX_PHOTOS:
        raise HTTPException(400, f"Upload at most {MAX_PHOTOS} photos.")

    images: list[bytes] = []
    mime_types: list[str] = []
    for p in photos:
        data = await p.read()
        name = p.filename or "file"
        if not data:
            raise HTTPException(400, f"{name} is empty.")
        if len(data) > MAX_BYTES:
            raise HTTPException(413, f"{name} is larger than 12 MB. Please upload a smaller photo.")
        kind = _sniff_image(data)
        if kind is None:
            raise HTTPException(415, f"{name} is not a supported image. Use JPEG, PNG, WEBP or HEIC photos.")
        images.append(data)
        mime_types.append(kind)

    # 1) Gemini: visible condition. Nothing is saved if analysis fails.
    try:
        condition = gemini.extract_condition(images, mime_types)
    except Exception as e:
        msg = str(e)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            raise HTTPException(503, "Photo analysis is busy right now (rate limited). Nothing was saved — please retry in a minute.")
        if "timed out" in msg.lower() or "timeout" in type(e).__name__.lower() or "DEADLINE" in msg:
            raise HTTPException(504, "Photo analysis timed out. Nothing was saved — please retry, ideally with fewer or smaller photos.")
        raise HTTPException(502, f"Photo analysis failed ({type(e).__name__}). Nothing was saved — please retry.")

    # 2) VAHAN: authoritative record (unavailable => NOT VERIFIED, never invented)
    rc = vahan.fetch_rc(reg_number)

    # 3) Deterministic cross-check + evidence-linked assessment
    claimed = claimed_make_model.strip()[:80]
    cc = scoring.cross_check(condition, rc, claimed_make_model=claimed)
    findings, breakdown, risk_score, risk_band, red_flags = scoring.assess(condition, cc, rc, claimed)

    # 4) Evidence storage (optional)
    photo_uris = upload_photos(images, mime_types)

    # 5) Persist + append-only audit trail (one event per pipeline stage)
    result = VerificationResult(
        reg_number=rc.reg_number,
        claimed_make_model=claimed,
        condition=condition,
        rc=rc,
        cross_checks=cc,
        findings=findings,
        score_breakdown=breakdown,
        risk_score=risk_score,
        risk_band=risk_band,
        red_flags=red_flags,
        rc_verified=(rc.source == "live"),
        photo_uris=photo_uris,
        gemini_mode=config.GEMINI_MODE,
        vahan_mode=rc.source,
    )
    store = get_store()
    saved = store.save(result)  # records the "created" audit event + ids
    store.append_audit(saved.id, "gemini", config.GEMINI_MODE,
                       f"{len(condition.damage)} damage item(s), confidence={condition.overall_confidence:.2f}")
    store.append_audit(saved.id, "vahan", rc.source,
                       (f"insurance_until={rc.insurance_valid_until} financier={rc.financier or 'none'} challans={rc.challans}"
                        if rc.available else f"record unavailable — {rc.note}"))
    store.append_audit(saved.id, "scoring", "deterministic",
                       f"visible={breakdown.visible_condition} record={breakdown.record} "
                       f"uncertainty={breakdown.uncertainty} total={breakdown.total}")

    data = saved.model_dump()
    data["audit"] = store.get_audit(saved.id)
    return data


@app.get("/api/report/{share_id}")
def get_report(share_id: str):
    store = get_store()
    doc = store.get_by_share(share_id)
    if not doc:
        raise HTTPException(404, "Report not found.")
    doc = dict(doc)
    doc["audit"] = store.get_audit(doc.get("id", ""))
    return doc


# Serve the built React frontend at "/" (same origin as the API). Declared AFTER the
# API routes so /api/* and /healthz keep priority; this mount only catches the rest.
_STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(_STATIC_DIR):
    app.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="web")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
