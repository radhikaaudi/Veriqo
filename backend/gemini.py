"""Gemini multimodal condition extraction (the core AI step).

Uses the google-genai SDK with Gemini 2.5 Flash on Vertex AI. Structured output is
enforced via response_schema=ConditionReport, so we get typed JSON back, not prose.

GEMINI_MODE=mock returns a realistic report so the whole app runs with no cloud creds.
"""
from __future__ import annotations

import config
from models import ConditionReport, DamageItem, Severity, View

SYSTEM_INSTRUCTION = """You are Veriqo, an expert used-car pre-purchase inspector.
You are given one or more photos of a used car. Produce a STRUCTURED condition report.

HARD RULES:
- Report ONLY what is VISIBLE in the photos. Do NOT infer engine/transmission/internal
  mechanical condition from exterior images.
- Anything that cannot be judged from photos goes in `inspect_professionally`.
- This is a RED-FLAG TRIAGE, not a certification. NEVER conclude the car is "good",
  "fine", or "sound". Your job is to surface concerns and what to check.
- `overall_confidence` (0..1) measures how CLEARLY the photos show what you report:
  sharpness, lighting, distance. A sharp, well-lit close-up is high confidence even if it is
  the only photo. Do NOT lower it for missing views — coverage is handled separately.
- SEVERITY RUBRIC (apply strictly, do not inflate):
    minor    = cosmetic only (light scratches, scuffs, small chips, light surface wear);
    moderate = needs bodywork/replacement but not safety-relevant (deep or long scratches,
               dents, cracked bumper cover, noticeably worn tyre, torn upholstery);
    severe   = structural or safety-relevant (crumpled/torn metal, frame or pillar damage,
               rust perforation, tyre with no usable tread or exposed cords, broken lights).
- ONE item per distinct defect: a single scratch running across several panels is ONE item
  (name the panels in `location`). Do not split one defect into many items.
- Report only defects you can actually see clearly. Reflections, dirt, shadows, panel lines,
  normal tyre tread and the blurred registration plate are NOT damage. Never use type
  `other` for vague impressions — every item needs a concrete, visible defect.
- If you see signs of repainting / panel gaps / mismatched colour, flag possible past
  accident repair (as a visible observation, not a certainty).
- Photos are labelled "Photo 1", "Photo 2", ... For every damage item set `photo_number`
  to the photo that shows it (0 if unclear). Report each distinct issue as its own item.
- Worn tyre tread goes in `tyre_wear` (and as a damage item of type worn_tyre if clearly
  visible). Torn/damaged seats or trim are damage items of type interior_damage.
- `views_covered`: list a view ONLY if at least one photo was clearly taken to show it.
  Be strict — over-claiming coverage hides problems from the buyer:
    * a straight side profile = left_side OR right_side only (NOT front, NOT rear);
    * a front three-quarter shot = front + one side; a rear three-quarter = rear + one side;
    * `tyres` = a close-up where tread depth is judgeable, NOT wheels visible in a full-car shot;
    * `interior` = a photo taken inside the cabin, NOT seats glimpsed through a window;
    * a tight crop of one panel/part = close_up (plus the side it belongs to only if obvious).
- If photos are blurry, dark, or too partial to judge, report NO damage you cannot actually
  see, explain the limitation in the summary, and set overall_confidence below 0.4.
- If the photos do not show a car at all, say so and set overall_confidence to 0.
"""


def extract_condition(images: list[bytes], mime_types: list[str] | None = None) -> ConditionReport:
    if config.GEMINI_MODE != "live":
        return _mock_report()

    from google import genai
    from google.genai import types

    http = types.HttpOptions(timeout=config.GEMINI_TIMEOUT_MS)
    if config.USE_VERTEX:
        client = genai.Client(
            vertexai=True,
            project=config.GOOGLE_CLOUD_PROJECT,
            location=config.VERTEX_LOCATION,
            http_options=http,
        )
    else:
        client = genai.Client(api_key=config.GEMINI_API_KEY, http_options=http)

    parts: list = []
    for i, img in enumerate(images):
        mt = mime_types[i] if mime_types and i < len(mime_types) else "image/jpeg"
        parts.append(f"Photo {i + 1}:")
        parts.append(types.Part.from_bytes(data=img, mime_type=mt))
    parts.append("Analyze these photos of a used car and return the condition report.")

    resp = client.models.generate_content(
        model=config.GEMINI_MODEL,
        contents=parts,
        config=types.GenerateContentConfig(
            system_instruction=SYSTEM_INSTRUCTION,
            response_mime_type="application/json",
            response_schema=ConditionReport,
            temperature=0.0,   # same photos -> as close to the same answer as the model allows
            seed=7,
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
                       note="Scuffs consistent with low-speed contact", photo_number=1),
            DamageItem(location="left rear door", type="dent", severity=Severity.moderate,
                       note="Palm-sized dent, paint intact", photo_number=1),
            DamageItem(location="rear-right quarter panel", type="paint_mismatch",
                       severity=Severity.moderate, note="Slight shade difference — possible repaint", photo_number=1),
        ],
        views_covered=[View.front, View.left_side],
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
