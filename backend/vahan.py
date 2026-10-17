"""VAHAN RC verification — the second, AUTHORITATIVE evidence source.

VAHAN_MODE=mock returns a realistic RC record (labelled source='mock') so the app runs
without a provider key. Swap to live by setting VAHAN_MODE=live + VAHAN_API_URL/KEY and
adapting `_map_provider_response` to your chosen provider (Surepass/Signzy/Zoop/Gridlines).
"""
from __future__ import annotations

import config
from models import RcRecord


def fetch_rc(reg_number: str) -> RcRecord:
    reg_number = (reg_number or "").strip().upper()
    if config.VAHAN_MODE != "live":
        return _mock_rc(reg_number)
    return _fetch_live(reg_number)


def _fetch_live(reg_number: str) -> RcRecord:
    import httpx

    headers = {"Authorization": f"Bearer {config.VAHAN_API_KEY}", "Content-Type": "application/json"}
    payload = {"id_number": reg_number}   # provider-specific; adjust per docs
    try:
        with httpx.Client(timeout=20) as client:
            r = client.post(config.VAHAN_API_URL, json=payload, headers=headers)
            r.raise_for_status()
            return _map_provider_response(reg_number, r.json())
    except Exception as e:  # never 500 the whole verification on a provider hiccup
        rec = _mock_rc(reg_number)
        rec.source = f"live_error_fallback:{type(e).__name__}"
        return rec


def _map_provider_response(reg_number: str, data: dict) -> RcRecord:
    """ADAPT THIS to your provider's JSON shape. Example assumes a `data` envelope."""
    d = data.get("data", data) or {}
    return RcRecord(
        reg_number=reg_number,
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


def _mock_rc(reg_number: str) -> RcRecord:
    """Deterministic demo data keyed off the reg number so demos are repeatable.
    Reg numbers ending in an even digit simulate a 'clean-ish' car; odd simulate issues."""
    last = next((c for c in reversed(reg_number) if c.isdigit()), "0")
    risky = int(last) % 2 == 1
    return RcRecord(
        reg_number=reg_number or "MH01AB1234",
        make="Maruti Suzuki",
        model="Swift VXI",
        reg_date="2018-03-14",
        fuel="Petrol",
        insurance_valid_until="2024-11-30" if risky else "2027-02-28",  # expired if risky
        financier="HDFC Bank Ltd" if risky else "",                      # active loan if risky
        challans=3 if risky else 0,
        blacklisted=False,
        rto="RTO Mumbai Central (MH-01)",
        source="mock",
    )
