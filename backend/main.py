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

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/healthz")
def healthz():
    return {
        "status": "ok",
        "gemini_mode": config.GEMINI_MODE,
        "vahan_mode": config.VAHAN_MODE,
        "store_mode": config.STORE_MODE,
        "model": config.GEMINI_MODEL,
    }


@app.post("/api/verify")
async def verify(
    reg_number: str = Form(...),
    photos: list[UploadFile] = File(...),
):
    if not photos:
        raise HTTPException(400, "At least one photo is required.")
    if len(photos) > MAX_PHOTOS:
        raise HTTPException(400, f"Max {MAX_PHOTOS} photos.")

    images: list[bytes] = []
    mime_types: list[str] = []
    for p in photos:
        data = await p.read()
        if len(data) > MAX_BYTES:
            raise HTTPException(400, f"{p.filename} exceeds 12 MB.")
        images.append(data)
        mime_types.append(p.content_type or "image/jpeg")

    # 1) Gemini: visible condition
    try:
        condition = gemini.extract_condition(images, mime_types)
    except Exception as e:
        raise HTTPException(502, f"Gemini extraction failed: {type(e).__name__}: {e}")

    # 2) VAHAN: authoritative record
    rc = vahan.fetch_rc(reg_number)

    # 3) Deterministic cross-check + evidence-linked assessment
    cc = scoring.cross_check(condition, rc)
    findings, breakdown, risk_score, risk_band, red_flags = scoring.assess(condition, cc, rc)

    # 4) Evidence storage (optional)
    photo_uris = upload_photos(images, mime_types)

    # 5) Persist + append-only audit trail (one event per pipeline stage)
    result = VerificationResult(
        reg_number=rc.reg_number,
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
                       f"insurance_until={rc.insurance_valid_until} financier={rc.financier or 'none'} challans={rc.challans}")
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=config.PORT, reload=True)
