"""Gemini multimodal condition extraction (the core AI step).

Uses the google-genai SDK with Gemini 2.5 Flash on Vertex AI. Structured output is
enforced via response_schema=ConditionReport, so we get typed JSON back, not prose.

GEMINI_MODE=mock returns a realistic report so the whole app runs with no cloud creds.
"""
from __future__ import annotations

import config
from models import ConditionReport, DamageItem, Severity

SYSTEM_INSTRUCTION = """You are Veriqo, an expert used-car pre-purchase inspector.
You are given one or more photos of a used car. Produce a STRUCTURED condition report.

HARD RULES:
- Report ONLY what is VISIBLE in the photos. Do NOT infer engine/transmission/internal
  mechanical condition from exterior images.
- Anything that cannot be judged from photos goes in `inspect_professionally`.
- This is a RED-FLAG TRIAGE, not a certification. NEVER conclude the car is "good",
  "fine", or "sound". Your job is to surface concerns and what to check.
- Be calibrated: set `overall_confidence` lower when photos are few, blurry, or partial.
- If you see signs of repainting / panel gaps / mismatched colour, flag possible past
  accident repair (as a visible observation, not a certainty).
"""


def extract_condition(images: list[bytes], mime_types: list[str] | None = None) -> ConditionReport:
    if config.GEMINI_MODE != "live":
        return _mock_report()

    from google import genai
    from google.genai import types

    if config.USE_VERTEX:
        client = genai.Client(
            vertexai=True,
            project=config.GOOGLE_CLOUD_PROJECT,
            location=config.VERTEX_LOCATION,
        )
    else:
        client = genai.Client(api_key=config.GEMINI_API_KEY)

    parts: list = []
    for i, img in enumerate(images):
        mt = mime_types[i] if mime_types and i < len(mime_types) else "image/jpeg"
        parts.append(types.Part.from_bytes(data=img, mime_type=mt))
    parts.append("Analyze these photos of a used car and return the condition report.")

    resp = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=parts,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=ConditionReport,
            temperature=0.2,
        ),
    )

    report = getattr(resp, "parsed", None)
    if report is None:  # fallback: parse raw text
        report = ConditionReport.model_validate_json(resp.text)
    report.overall_confidence = max(0.0, min(1.0, float(report.overall_confidence)))
    return report


def _mock_report() -> ConditionReport:
    """Labelled demo data so the pipeline runs without Vertex access."""
    return ConditionReport(
        overall_summary=(
            "[MOCK] Compact hatchback in fair cosmetic condition. Visible scuffing on the "
            "front bumper and a dent on the left rear door. No major visible rust."
        ),
        damage=[
            DamageItem(location="front bumper", type="scratch", severity=Severity.minor,
                       note="Scuffs consistent with low-speed contact"),
            DamageItem(location="left rear door", type="dent", severity=Severity.moderate,
                       note="Palm-sized dent, paint intact"),
            DamageItem(location="rear-right quarter panel", type="paint_mismatch",
                       severity=Severity.moderate, note="Slight shade difference — possible repaint"),
        ],
        rust_level=Severity.minor,
        tyre_wear=Severity.moderate,
        interior_condition="Seats worn but clean; dashboard intact.",
        visible_odometer_reading="",
        red_flags=[
            "Possible repaint on rear-right quarter panel (check for prior accident repair)",
            "Uneven tyre wear — could indicate alignment/suspension issues",
        ],
        inspect_professionally=[
            "Engine and transmission (not visible in photos)",
            "Underbody / chassis for structural repair",
            "Suspension and wheel alignment (tyre wear pattern)",
            "Service history and actual odometer vs reading",
        ],
        overall_confidence=0.62,
    )
