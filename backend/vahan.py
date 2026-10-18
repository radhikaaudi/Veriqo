"""VAHAN RC verification — the second, authoritative evidence source.

VAHAN_MODE=mock serves ONLY the clearly synthetic test plates in fixtures/rc_fixtures.json
(fake 'ZZ' state code). Any other plate returns available=False ("not verified") — the app
never invents a record for an arbitrary registration number.

VAHAN_MODE=live calls a provider (Surepass/Signzy/Zoop/Gridlines). Adapt
`_map_provider_response` to the provider's JSON. On any provider error the record is
returned as UNAVAILABLE — never silently replaced with demo data.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path

import config
from models import RcRecord

_FIXTURES = Path(__file__).with_name("fixtures") / "rc_fixtures.json"


def normalize(reg_number: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", (reg_number or "").upper())


def fetch_rc(reg_number: str) -> RcRecord:
    reg = normalize(reg_number)
    if not reg:
        return RcRecord(reg_number="", available=False, source=config.VAHAN_MODE,
                        note="No registration number supplied.")
    if config.VAHAN_MODE != "live":
        return _fixture_rc(reg)
    return _fetch_live(reg)


@lru_cache(maxsize=1)
def _fixtures() -> dict:
    return json.loads(_FIXTURES.read_text())["records"]


def _fixture_rc(reg: str) -> RcRecord:
    rec = _fixtures().get(reg)
    if rec is None:
        return RcRecord(
            reg_number=reg, available=False, source="mock",
            note="Not in the simulated test dataset — no registration data available. NOT VERIFIED.",
        )
    fields = {k: v for k, v in rec.items() if not k.startswith("_")}
    return RcRecord(reg_number=reg, available=True, source="mock",
                    note="SIMULATED test record — not government verified.", **fields)


def _fetch_live(reg: str) -> RcRecord:
    import httpx

    headers = {"Authorization": f"Bearer {config.VAHAN_API_KEY}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=20) as client:
            r = client.post(config.VAHAN_API_URL, json={"id_number": reg}, headers=headers)
            if r.status_code == 404:
                return RcRecord(reg_number=reg, available=False, source="live",
                                note="Provider returned no record for this registration. NOT VERIFIED.")
            r.raise_for_status()
            return _map_provider_response(reg, r.json())
    except Exception as e:  # never 500 the whole verification, and never fabricate a record
        return RcRecord(reg_number=reg, available=False, source="live_error",
                        note=f"Registration lookup failed ({type(e).__name__}). NOT VERIFIED.")


def _map_provider_response(reg: str, data: dict) -> RcRecord:
    """ADAPT THIS to your provider's JSON shape. Example assumes a `data` envelope."""
    d = data.get("data", data) or {}
    return RcRecord(
        reg_number=reg,
        available=True,
        make=d.get("maker_description", d.get("make", "")),
        model=d.get("maker_model", d.get("model", "")),
        reg_date=d.get("registration_date", d.get("reg_date", "")),
        fuel=d.get("fuel_type", d.get("fuel", "")),
        insurance_valid_until=d.get("insurance_upto", d.get("insurance_valid_until", "")),
        financier=d.get("financer", d.get("financier", "")),
        challans=int(d.get("challan_count", 0) or 0),
        blacklisted=bool(d.get("blacklist_status") or d.get("blacklisted") or False),
        rto=d.get("registered_at", d.get("rto", "")),
        source="live",
    )
