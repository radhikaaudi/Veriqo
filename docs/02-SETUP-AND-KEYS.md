# Veriqo — Setup & Go-Live Runbook (what to do, step by step)

> Goal: take Veriqo from "runs in mock mode on your laptop" → "live on the internet with real Gemini, real Firestore, kept warm for judging."
> **Do the steps in order.** Each step ends with a *test* so you catch problems early.
> **Golden rule:** all secrets go in `backend/.env` (local) or Cloud Run **env vars** (deploy). The `.env` file is git-ignored — **never commit it.**

---

## 0. The only "keys"/values that exist (cheat sheet)

| # | Service | What you actually need | Where it goes (env var) | Required? |
|---|---|---|---|---|
| 1 | **Gemini** | *Either* an AI Studio **API key** *or* a Vertex **project + login** | `GEMINI_API_KEY` **or** `GOOGLE_CLOUD_PROJECT` | ✅ **Required** (this is what makes the AI real) |
| 2 | **Firestore** | A GCP project (NO key — uses your login / Cloud Run's identity) | `STORE_MODE=firestore` + `GOOGLE_CLOUD_PROJECT` | ✅ Required for deploy |
| 3 | **Cloud Run** | A GCP project + billing | (set at deploy time) | ✅ Required to be "live" |
| 4 | **Cloud Storage** | A bucket name | `GCS_BUCKET` | ⬜ Optional (photos) |
| 5 | **VAHAN RC** | Provider API **URL + key** | `VAHAN_API_URL`, `VAHAN_API_KEY` | ⬜ Optional (mock until you have it) |
| 6 | **Firebase Hosting** | A Firebase project (links to the same GCP project) | (Firebase CLI) | ✅ Required for the web link |

> Key insight: **when you use Vertex, there is no "API key" to paste.** Google Cloud authenticates you by your *login* (locally) or the Cloud Run *service account* (in the cloud). The only literal "key" strings you ever paste are the **AI Studio Gemini key** (if you choose that path) and the **VAHAN provider key**.

---

## 1. Create the accounts (once)
1. **Google account** — you have one.
2. **Google Cloud** — go to <https://console.cloud.google.com>, accept terms. New users get **$300 free credit / 90 days**.
3. **Enable billing** — Console → *Billing* → link a card. ⚠️ **Billing must be ON even to use the free tier.** This is the #1 reason deploys fail.
4. **Firebase** — go to <https://console.firebase.google.com>, "Add project", and **select your existing Google Cloud project** (don't make a separate one — they must be the same project).
5. *(Optional)* **VAHAN RC provider** — sign up at Surepass / Signzy / Zoop / Gridlines for an RC-verification API.

---

## 2. Install the tools (once)
```bash
# macOS (Homebrew)
brew install --cask google-cloud-sdk       # gcloud
npm install -g firebase-tools              # firebase
# python3 and node you already have (node v24, python3 confirmed)

gcloud --version && firebase --version
```
Then log in:
```bash
gcloud auth login                          # opens browser
gcloud config set project YOUR_PROJECT_ID  # from the Cloud Console (top bar)
firebase login                             # opens browser
```
> Need to run an interactive login in this chat? Type it with a leading `!`, e.g. `! gcloud auth login`.

---

## 3. ⚡ Fastest path to LIVE Gemini (AI Studio key) — ~5 minutes

Do this first to prove the AI works before any cloud deployment.

1. Go to **<https://aistudio.google.com/apikey>** → **Create API key** → copy it (looks like `AIza...`).
2. Edit `veriqo/backend/.env` (create it from `.env.example` if missing):
   ```env
   GEMINI_MODE=live
   USE_VERTEX=false
   GEMINI_API_KEY=AIza...your-key...
   GEMINI_MODEL=gemini-2.5-flash
   ```
3. Restart the backend and test with a **real car photo**:
   ```bash
   cd veriqo/backend && source .venv/bin/activate
   uvicorn main:app --reload --port 8080
   # new terminal:
   curl -s localhost:8080/healthz          # should show "gemini_mode":"live"
   curl -s -F reg_number=MH01AB1234 -F photos=@/path/to/real_car.jpg localhost:8080/api/verify | python3 -m json.tool
   ```
   If you get a real `overall_summary` describing *your* photo → **the AI is live.** 🎉

> This path satisfies the "Gemini" requirement and is the fastest. Step 4 upgrades it to the more Google-Cloud-native Vertex path, which looks stronger to judges.

---

## 4. Google-Cloud-native path (Gemini on Vertex AI) — recommended for the submission

1. Enable the APIs (one command):
   ```bash
   gcloud services enable aiplatform.googleapis.com run.googleapis.com \
     firestore.googleapis.com storage.googleapis.com
   ```
2. Give your **local** machine credentials for Google libraries (this is the "key" for Vertex locally):
   ```bash
   gcloud auth application-default login
   ```
3. Set `backend/.env`:
   ```env
   GEMINI_MODE=live
   USE_VERTEX=true
   GOOGLE_CLOUD_PROJECT=your-project-id
   VERTEX_LOCATION=us-central1
   GEMINI_MODEL=gemini-2.5-flash
   # (leave GEMINI_API_KEY blank)
   ```
4. Restart uvicorn and re-run the `curl` test from step 3. Same result, now via Vertex.

> If you see a **403 / quota** error: in the Console open *IAM & Admin → Quotas*, search "Gemini", and request an increase early. New projects start low.

---

## 5. Turn on Firestore (real persistence)
1. Create the database (native mode, same region):
   ```bash
   gcloud firestore databases create --location=us-central1
   ```
2. Set in `backend/.env`:
   ```env
   STORE_MODE=firestore
   ```
3. Restart, run a verify, then open **Firestore in the Console** → you should see a `verifications/{id}` document with an `audit` sub-collection. ✅

---

## 6. (Optional) Cloud Storage for evidence photos
```bash
gsutil mb -l us-central1 gs://YOUR_UNIQUE_BUCKET_NAME
```
Set `backend/.env`:
```env
GCS_BUCKET=YOUR_UNIQUE_BUCKET_NAME
```
(If you skip this, photos just get `local://` placeholder URIs — fine for the demo.)

---

## 7. (Optional) VAHAN RC — the second authoritative source
Until you have a provider key, the RC check runs as a **labelled mock** (the report shows `rc.source: mock`). To go live:
1. Get your provider's **endpoint URL** and **API key**.
2. Open `backend/vahan.py` → adjust `_map_provider_response()` to match your provider's JSON field names (there's a template there).
3. Set `backend/.env`:
   ```env
   VAHAN_MODE=live
   VAHAN_API_URL=https://api.yourprovider.com/rc/verify
   VAHAN_API_KEY=your-provider-key
   ```
4. Test with a **real Indian reg number**; confirm `rc.source: live` in the response.

---

## 8. Deploy the backend to Cloud Run
```bash
cd veriqo/backend

gcloud run deploy veriqo-api \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --min-instances 1 \
  --set-env-vars GEMINI_MODE=live,USE_VERTEX=true,STORE_MODE=firestore,GOOGLE_CLOUD_PROJECT=$(gcloud config get-value project),VERTEX_LOCATION=us-central1,GEMINI_MODEL=gemini-2.5-flash
```
- `--min-instances 1` keeps it **warm** (no cold starts during judging). Keep it set Oct 19–Nov 6.
- The service id **must be `veriqo-api`** (it's referenced in `firebase.json`).
- If you used the AI Studio key path instead, add `USE_VERTEX=false` and store the key as a secret:
  ```bash
  echo -n "AIza...yourkey" | gcloud secrets create gemini-key --data-file=-
  gcloud run deploy veriqo-api ... --set-secrets GEMINI_API_KEY=gemini-key:latest
  ```

**Grant the Cloud Run service account permissions** (so it can call Vertex/Firestore/Storage — no key files needed):
```bash
PROJECT_NUMBER=$(gcloud projects describe $(gcloud config get-value project) --format='value(projectNumber)')
SA=$PROJECT_NUMBER-compute@developer.gserviceaccount.com
for ROLE in roles/aiplatform.user roles/datastore.user roles/storage.objectAdmin; do
  gcloud projects add-iam-policy-binding $(gcloud config get-value project) --member="serviceAccount:$SA" --role="$ROLE"
done
```
Test the deployed API:
```bash
SERVICE_URL=$(gcloud run services describe veriqo-api --region us-central1 --format='value(status.url)')
curl -s $SERVICE_URL/healthz
```

---

## 9. Deploy the frontend to Firebase Hosting
```bash
cd veriqo/frontend
# leave VITE_API_BASE blank so the app calls same-origin /api (Hosting rewrites to Cloud Run)
npm install && npm run build

cd ..                     # into veriqo/ (where firebase.json lives)
firebase use YOUR_PROJECT_ID
firebase deploy --only hosting,firestore:rules
```
Firebase prints a **Hosting URL** (e.g. `https://your-project.web.app`) → that's your **deployed prototype link** for the submission. Open it, upload a real car photo, and confirm the full flow works in the browser.

---

## 10. Final checklist (before you submit / record the video)
- [ ] Live Hosting URL loads and runs a full verification end-to-end
- [ ] `GEMINI_MODE=live` (confirm via `$SERVICE_URL/healthz`) — **not mock**
- [ ] `STORE_MODE=firestore` and a doc appears in the Firestore console
- [ ] Cloud Run `--min-instances 1` (stays warm)
- [ ] Everything in **one US region** (us-central1)
- [ ] Billing enabled; Vertex quota sufficient (no 403s)
- [ ] `.env` is NOT committed to GitHub; repo is public & accessible
- [ ] Demo video recorded against the **live URL**, not localhost
- [ ] Brief description names Firebase, Firestore, Cloud Run, Gemini

---

## Security notes
- `backend/.env` and `frontend/.env.local` are git-ignored — keep it that way.
- Prefer **Secret Manager** over plain env vars for the VAHAN key and any AI Studio key in production.
- If a key leaks: AI Studio keys rotate at <https://aistudio.google.com/apikey>; delete the exposed one.
- Restrict your AI Studio API key (API restrictions → Generative Language API) in the Cloud Console.

---

### Quick reference: what goes in `backend/.env` for a full live setup
```env
GEMINI_MODE=live
USE_VERTEX=true
GOOGLE_CLOUD_PROJECT=your-project-id
VERTEX_LOCATION=us-central1
GEMINI_MODEL=gemini-2.5-flash
STORE_MODE=firestore
GCS_BUCKET=your-bucket-name          # optional
VAHAN_MODE=live                      # optional
VAHAN_API_URL=https://api.yourprovider.com/rc/verify   # optional
VAHAN_API_KEY=your-provider-key      # optional
CORS_ORIGINS=*
```
