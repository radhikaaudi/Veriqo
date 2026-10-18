#!/usr/bin/env bash
# Build the frontend, bundle it into the backend, and deploy Veriqo to Cloud Run.
# Usage: ./scripts/deploy.sh            (run from the repo root)
#
# Uses --async and polls the revision itself: on some networks `gcloud run deploy`
# keeps waiting after the rollout has already succeeded.
set -euo pipefail

PROJECT="${PROJECT:-veriqo-512010}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-veriqo-api}"
BUCKET="${BUCKET:-veriqo-512010-uploads}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ building frontend (same-origin API)"
(cd "$ROOT/frontend" && VITE_API_BASE= npm run build >/dev/null)
rm -rf "$ROOT/backend/static" && cp -r "$ROOT/frontend/dist" "$ROOT/backend/static"

PREV="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" \
        --format='value(status.latestReadyRevisionName)' 2>/dev/null || true)"
echo "▶ current revision: ${PREV:-none}"

echo "▶ deploying (async)"
(cd "$ROOT/backend" && gcloud run deploy "$SERVICE" --source . --region "$REGION" --project "$PROJECT" \
  --allow-unauthenticated --min-instances 1 --memory 1Gi --timeout 120 --quiet --async \
  --set-env-vars "GEMINI_MODE=live,USE_VERTEX=true,STORE_MODE=firestore,VAHAN_MODE=mock,GCS_BUCKET=$BUCKET,GOOGLE_CLOUD_PROJECT=$PROJECT,VERTEX_LOCATION=$REGION,GEMINI_MODEL=gemini-2.5-flash,GEMINI_TIMEOUT_MS=60000")

echo "▶ waiting for a new ready revision (up to 15 min)"
for _ in $(seq 1 90); do
  NOW="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" \
         --format='value(status.latestReadyRevisionName)')"
  if [[ -n "$NOW" && "$NOW" != "$PREV" ]]; then
    URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT" --format='value(status.url)')"
    echo "✔ live: $NOW  →  $URL"
    curl -fsS "$URL/api/health" && echo
    echo "Rollback if needed:"
    echo "  gcloud run services update-traffic $SERVICE --region $REGION --to-revisions=$PREV=100"
    exit 0
  fi
  sleep 10
done
echo "✖ no new ready revision after 15 min — check: gcloud builds list --region $REGION --limit 3" >&2
exit 1
