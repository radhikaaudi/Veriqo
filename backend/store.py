"""Persistence: in-memory (default, for local dev) or Firestore (for deploy).
Every verification writes a case document + an append-only audit trail."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import config
from models import VerificationResult


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _short_id() -> str:
    return uuid.uuid4().hex[:10]


class MemoryStore:
    def __init__(self) -> None:
        self._by_id: dict[str, dict] = {}
        self._share_to_id: dict[str, str] = {}
        self._audit: dict[str, list[dict]] = {}

    def save(self, result: VerificationResult) -> VerificationResult:
        result.id = result.id or uuid.uuid4().hex
        result.share_id = result.share_id or _short_id()
        result.created_at = result.created_at or _now_iso()
        self._by_id[result.id] = result.model_dump()
        self._share_to_id[result.share_id] = result.id
        self.append_audit(result.id, "created", "ok", f"risk={result.risk_score} band={result.risk_band}")
        return result

    def get_by_share(self, share_id: str) -> dict | None:
        _id = self._share_to_id.get(share_id)
        return self._by_id.get(_id) if _id else None

    def append_audit(self, verification_id: str, step: str, status: str, detail: str = "") -> None:
        self._audit.setdefault(verification_id, []).append(
            {"ts": _now_iso(), "step": step, "status": status, "detail": detail}
        )

    def get_audit(self, verification_id: str) -> list[dict]:
        return self._audit.get(verification_id, [])


class FirestoreStore:
    def __init__(self) -> None:
        from google.cloud import firestore

        self.db = firestore.Client(project=config.GOOGLE_CLOUD_PROJECT or None)
        self.col = self.db.collection("verifications")

    def save(self, result: VerificationResult) -> VerificationResult:
        result.id = result.id or uuid.uuid4().hex
        result.share_id = result.share_id or _short_id()
        result.created_at = result.created_at or _now_iso()
        self.col.document(result.id).set(result.model_dump())
        self.append_audit(result.id, "created", "ok", f"risk={result.risk_score} band={result.risk_band}")
        return result

    def get_by_share(self, share_id: str) -> dict | None:
        docs = self.col.where("share_id", "==", share_id).limit(1).stream()
        for d in docs:
            return d.to_dict()
        return None

    def append_audit(self, verification_id: str, step: str, status: str, detail: str = "") -> None:
        self.col.document(verification_id).collection("audit").add(
            {"ts": _now_iso(), "step": step, "status": status, "detail": detail}
        )

    def get_audit(self, verification_id: str) -> list[dict]:
        docs = self.col.document(verification_id).collection("audit").order_by("ts").stream()
        return [d.to_dict() for d in docs]


_store = None


def get_store():
    global _store
    if _store is None:
        _store = FirestoreStore() if config.STORE_MODE == "firestore" else MemoryStore()
    return _store
