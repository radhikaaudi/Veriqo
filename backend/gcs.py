"""Optional Cloud Storage upload for evidence photos. No-op (placeholder URIs) if
GCS_BUCKET is unset, so the app runs locally without a bucket."""
from __future__ import annotations

import uuid

import config


def upload_photos(images: list[bytes], mime_types: list[str] | None = None) -> list[str]:
    if not config.GCS_BUCKET:
        return [f"local://photo/{i}" for i in range(len(images))]

    from google.cloud import storage

    client = storage.Client(project=config.GOOGLE_CLOUD_PROJECT or None)
    bucket = client.bucket(config.GCS_BUCKET)
    uris: list[str] = []
    folder = uuid.uuid4().hex[:12]
    for i, img in enumerate(images):
        mt = mime_types[i] if mime_types and i < len(mime_types) else "image/jpeg"
        ext = {"image/png": "png", "image/webp": "webp"}.get(mt, "jpg")
        blob = bucket.blob(f"verifications/{folder}/{i}.{ext}")
        blob.upload_from_string(img, content_type=mt)
        uris.append(f"gs://{config.GCS_BUCKET}/{blob.name}")
    return uris
