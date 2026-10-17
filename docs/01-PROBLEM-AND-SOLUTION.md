# Veriqo — Problem Statement & Solution

> **Veriqo** (formerly "AutoVerify") — *Verify any used car in 60 seconds, before you pay anyone.*
> AI Builder Cup 2026 submission · Theme: **Retail & Commerce** · Built on **Firebase · Firestore · Cloud Run · Gemini**.

---

## 1. The Problem

Buying a used car in India is a trust minefield, and it is the **#1-ranked problem on Razorpay's "Fix My Itch" board** — demand is externally validated, not invented.

**The market (verified):**
- ~**5.9M used cars sold in FY24–25**, growing to **9.5M by 2030** (~10% CAGR); used:new ratio ~1.4x.
- **AI tools are used in only ~6% of purchases today** — a wide-open lane.
- The **unorganized / C2C segment is the majority of volume (~63–71%)** and has *zero* verification support.

**The pain (verified):**
- ~**30% of inspected cars had hidden accident history**; ~**20–25% had undisclosed engine/mechanical defects**.
- Hidden defects commonly cost buyers **₹50,000–₹3 lakh** in repairs.
- India has **no anti-odometer-fraud law** and **no national vehicle-history database** (no Carfax equivalent). *(The "1 in 5 cars have tampered odometers" figure is widely reported but low-authority — cite as "widely reported," not hard data.)*

**Who feels it:** a private buyer about to purchase from an individual seller or a third-party listing (OLX, Facebook, local dealer). Existing players (Cars24, Spinny, Maruti True Value) inspect **only the cars they sell**. Independent inspections (Droom ECO ~₹599; Wisedrive/Nxcar ₹1,300–2,500) are **physical, appointment-based, metro-only, and take a day**. **No major Indian platform offers a self-serve "upload photos → instant AI report on any car" tool.**

---

## 2. The Solution

**Veriqo** is a free, 60-second **first-pass verification** that combines two evidence sources into one shareable report:

1. **Condition report from photos** — the user uploads car photos; Gemini vision identifies visible damage, rust, panel/paint mismatches, tyre wear, and interior condition, each with a confidence score and a red-flag list.
2. **Registration check from the reg number** — a VAHAN-backed RC API returns authoritative facts: make/model match, **insurance validity, financier/hypothecation (still under a loan?), challans, and blacklist status.**

The system cross-checks the two (does the photographed car match the RC record? is insurance expired?), computes a deterministic **maintenance-cost-risk score**, and produces a structured report:

> *"Here's what looks wrong, here's what the official record says, and here are the specific things to get professionally inspected."*

**Framing (critical):** Veriqo is a **red-flag triage, never a certification.** It tells you what to check — it never says "this car is sound." This mirrors how smart buyers actually think and keeps the product honest and low-liability. It is advisory, confidence-scored, and recommends a professional inspection for anything uncertain.

**Why this is credible, not speculative:** photo-based damage assessment is already in production at scale — **Tractable powers GEICO's estimate review; Ageas (UK) does end-to-end smartphone-photo damage decisions in minutes.** The documented limitation (a 250k-assessment study): AI reliably reads *visible* damage but **cannot infer internal/mechanical faults from photos** — which is exactly why Veriqo is a triage that points you to what needs a mechanic.

---

## 3. How the AI does meaningful work (the 40% technical story)

This is a clean instance of the AI Builder Cup's highest-scoring compound pattern:

```
Messy multimodal input (car photos) → structured extraction (Gemini) →
authoritative data verification (VAHAN API) → deterministic cross-check & scoring (NOT the LLM) →
a useful report → persistent, shareable audit trail (Firestore)
```

| Layer | Who does it | What happens |
|---|---|---|
| **Perception** | **Gemini 2.5 Flash (multimodal)** | Reads photos → typed JSON: `{exterior_panels[], damage[], rust_level, tyre_wear, interior_condition, red_flags[], overall_confidence}`. Conventional software cannot do this without per-model training. |
| **Authoritative data** | **VAHAN RC API** (tool call) | Reg number → `{make, model, reg_date, insurance_valid_until, financier, challans, blacklist_status}`. Real government-backed data. |
| **Validation** | **Deterministic code (Cloud Run)** | Cross-check photo-model vs RC-model; flag expired insurance / active loan / blacklist; compute maintenance-cost-risk score. **This stays out of the LLM** — the "AI isn't doing everything" sophistication judges reward. |
| **Persistence** | **Firestore** | Each verification = a case document + append-only audit trail; shareable report link. |
| **Uncertainty** | Gemini `confidence` | Low confidence → "needs professional inspection" rather than a false all-clear. |

---

## 4. Google stack mapping (what the submission must name)

| Service | Role in Veriqo | Essential? |
|---|---|---|
| **Gemini (2.5 Flash on Vertex AI)** | Multimodal condition extraction + structured output | **Essential** |
| **Cloud Run** | Hosts the orchestration API + deterministic scoring + VAHAN call | **Essential** |
| **Firestore** | Case history + append-only audit trail + shareable reports | **Essential** |
| **Firebase (Hosting + Auth)** | Serves the web app; optional "my reports" login | **Essential** (Hosting) / Optional (Auth) |
| **Cloud Storage** | Stores uploaded car photos | **Essential** |
| VAHAN RC API (Surepass/Signzy/Zoop/Gridlines) | Authoritative registration verification | **Essential** (the 2nd source) |
| Google Search grounding | Common-faults / recall context for a model | Optional (metered — use sparingly) |
| Cloud Monitoring/Logging | Uptime + latency observability | Optional (operational) |

**Deliberately NOT used:** Maps, Pub/Sub, Speech-to-Text, Translation — none is load-bearing for Veriqo. Fewer moving parts = survives the uptime gate.

---

## 5. Firestore data model (preview)

```
verifications/{verificationId}
  ├─ createdAt, userId (optional)
  ├─ regNumber
  ├─ photos: [gcsUri...]
  ├─ condition: { panels[], damage[], rust_level, tyre_wear, interior, confidence }
  ├─ rc: { make, model, regDate, insuranceValidUntil, financier, challans, blacklist }
  ├─ crossChecks: { modelMatch: bool, insuranceExpired: bool, underLoan: bool, blacklisted: bool }
  ├─ riskScore: number           // deterministic
  ├─ redFlags: [string]
  └─ shareId: string             // public shareable report

verifications/{verificationId}/audit/{eventId}   // append-only
  └─ { ts, step, status, detail }
```

---

## 6. The 3-minute demo plan

Target ~2:50 (confirm 3-min vs 3–4-min rule before recording).

| Time | Beat | What the judge sees |
|---|---|---|
| 0:00–0:20 | Problem | Used-car trust gap + the ₹-loss and 6M-market numbers. |
| 0:20–1:30 | **Live, authentic input** | Photograph a real car → upload → Gemini condition report appears with annotated red flags + confidence. **Zero simulation.** |
| 1:30–2:10 | **Authoritative cross-check** | Enter the reg number → VAHAN check returns insurance/loan/blacklist → deterministic risk score + cross-check flags. |
| 2:10–2:40 | Report + audit | Shareable report with "get these inspected" list; show the persisted case + audit trail. |
| 2:40–2:50 | **Tiny eval slide** | "Ran on 10 cars: caught 9/10 known visible issues, flagged 2 for inspection, 0 false all-clears." Big 40% booster. |

---

## 7. Build-vs-simulate boundary (be honest in the video + README)

**BUILD FOR REAL (judges test this live):**
- Photo upload → Cloud Run → Gemini structured condition extraction
- VAHAN RC lookup (use a real RC-API sandbox/key; if unavailable, a clearly-labeled stub with real schema)
- Deterministic cross-check + risk score
- Firestore persistence + shareable report + audit trail
- Deployed on a public Firebase Hosting URL, kept warm

**SIMULATE / SEED (clearly labeled):**
- If the VAHAN API key isn't approved in time → a **labeled mock** returning the real field schema (swap to live later).
- Common-faults grounding may be a small curated note per model if Search grounding quota is tight.

**Rule:** the perception → verification → scoring → audit spine is 100% real. Only an unavailable third-party API gets a labeled stub.

---

## 8. Risks & mitigations
- *Photos miss mechanical faults* → red-flag triage framing ("get these professionally checked"). Evidence-backed, not a hedge.
- *Liability* → advisory, confidence-scored, recommend professional inspection.
- *VAHAN API access delay* → labeled mock with the real schema; swap in the live key when approved.
- *Cold starts (uptime gate)* → `min-instances=1` or a cron pinger during Oct 19–Nov 6.

---

## 9. Submission checklist (map to the rules)
- [ ] Deployed live link (Firebase Hosting + Cloud Run), kept warm
- [ ] Public GitHub repo
- [ ] Pitch deck (prescribed template)
- [ ] ≤3-min demo video against the **live** app
- [ ] Brief description naming **Firebase, Firestore, Cloud Run, Gemini**
- [ ] Confirm eligibility (21+, working professionals, no students, JAPAC)

---

*Next doc: `02-ARCHITECTURE.md` (sequence + API contract) and then the code scaffold — pending the backend-language decision.*
