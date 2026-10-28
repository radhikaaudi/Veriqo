# Veriqo

**Verify any used car in 60 seconds — before you pay anyone.**
AI Builder Cup 2026 · Theme: Retail & Commerce · Built on **Firebase · Firestore · Cloud Run · Gemini**.

### 🎥 Demo videos
- **Original version:** https://youtu.be/zZbVIwDWArE
- **English version:** https://youtu.be/B015EyHjXNM

**Live app:** https://veriqo-api-920194228751.us-central1.run.app

Upload photos of a used car + its registration number → Veriqo returns an evidence-backed
report combining **Gemini visual condition analysis** with an **authoritative VAHAN RC check**,
a deterministic **risk score**, red flags, and a "get these professionally inspected" list.
It is a **red-flag triage, not a certification.**

### What makes it auditable (not just "photo app + RC lookup")
Every conclusion is a **`Finding`** tagged with its **provenance** — `observed` (photo),
`record` (RC field), `inferred` (deterministic rule over a record), or `not_checked` (honestly
out of scope) — plus the evidence it was read from, a confidence, the risk **points** it added,
and a next action. The risk score is a transparent **`ScoreBreakdown`** (visible condition +
record + uncertainty), each dimension being the literal sum of its findings' points. Mock data
is labelled loudly and **never** shown as government-verified (`rc_verified` is true only on a
live source). See `docs/03-JUDGE-FEEDBACK-RESPONSE.md` for how this answers the judge roast,
and `docs/01-PROBLEM-AND-SOLUTION.md` for the full writeup.

Honest evaluation harness: `python backend/eval.py` runs a labelled test set
(`backend/eval_cases.json`) through the real scoring code and reports accuracy + latency —
without claiming a visual-accuracy number we haven't measured.

---

## How we use each mandatory technology
- **Gemini (2.5 Flash on Vertex AI):** multimodal analysis of car photos → typed JSON condition report (structured output). `backend/gemini.py`
- **Cloud Run:** hosts the FastAPI orchestration + deterministic scoring + VAHAN call. `backend/`
- **Firestore:** stores every verification as a case + an append-only audit trail; serves shareable reports. `backend/store.py`
- **Firebase:** Hosting serves the React app and rewrites `/api/**` to Cloud Run (same-origin); optional Auth for "my reports". `firebase.json`

---

## Architecture
```
Firebase Hosting (React) ──/api──▶ Cloud Run (FastAPI)
                                     1. Gemini 2.5 Flash  → condition JSON
                                     2. VAHAN RC API      → authoritative record
                                     3. deterministic     → cross-check + risk score
                                     4. Firestore         → case + append-only audit
                                     (Cloud Storage       → evidence photos, optional)
```

## Run locally (fully works with zero cloud credentials — mock mode)
```bash
# --- backend ---
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env            # defaults are mock/memory — runnable as-is
python smoke_test.py              # optional: verifies the core pipeline + provenance guarantees
python eval.py                    # optional: labelled eval of the deterministic layer (accuracy + latency)
uvicorn main:app --reload --port 8080

# --- frontend (new terminal) ---
cd frontend
npm install
cp .env.example .env.local        # VITE_API_BASE=http://localhost:8080
npm run dev                        # open http://localhost:5173
```
Try reg `MH01AB1234` (clean-ish) vs `MH01AB1237` (flags expired insurance + active loan).

## Go live (flip mocks → real Google services)
Set these in `backend/.env` (local) or as Cloud Run env vars:
```
GEMINI_MODE=live
USE_VERTEX=true
GOOGLE_CLOUD_PROJECT=<your-project>
VERTEX_LOCATION=us-central1
STORE_MODE=firestore
GCS_BUCKET=<your-bucket>        # optional, same US region
VAHAN_MODE=live                # + VAHAN_API_URL / VAHAN_API_KEY (adapt backend/vahan.py mapping)
```

### Deploy
```bash
# 0. One-time: enable APIs + pick ONE US region (free-tier friendly)
gcloud services enable run.googleapis.com aiplatform.googleapis.com firestore.googleapis.com
gcloud firestore databases create --location=us-central1   # if not created

# 1. Backend → Cloud Run (service id MUST match firebase.json: veriqo-api)
cd backend
gcloud run deploy veriqo-api \
  --source . --region us-central1 --allow-unauthenticated \
  --min-instances 1 \
  --set-env-vars GEMINI_MODE=live,USE_VERTEX=true,STORE_MODE=firestore,GOOGLE_CLOUD_PROJECT=$(gcloud config get-value project),VERTEX_LOCATION=us-central1

# 2. Frontend → Firebase Hosting (same-origin /api rewrite to Cloud Run)
cd ../frontend
# leave VITE_API_BASE blank so it uses same-origin /api
npm run build
cd ..
firebase deploy --only hosting,firestore:rules
```

## Reliability notes (the uptime gate has no mercy)
- **`--min-instances 1`** keeps Cloud Run warm (no cold-start during judging). Costs a little; worth it Oct 19–Nov 6.
- Pin **everything to one US region**. Ensure **billing is enabled** (required even for free tier).
- Use **GA Gemini 2.5 Flash** (set) — not preview models — for stable quota.
- Record the demo video against the **deployed** URL, not localhost.

## Build-vs-simulate (stated honestly in the demo)
- **Real:** photo → Gemini condition extraction → deterministic scoring → Firestore + audit → shareable report.
- **Labelled mock until keys land:** Gemini (`GEMINI_MODE=mock`) and VAHAN (`VAHAN_MODE=mock`). The RC record carries a `source` field (`mock`/`live`) so the UI shows which is which.

## Project layout
```
veriqo/
  backend/   FastAPI app (main, gemini, vahan, scoring, store, gcs, models, config)
  frontend/  React + Vite + TS
  docs/      01-PROBLEM-AND-SOLUTION.md
  firebase.json, firestore.rules, .env.example, .gitignore
```
