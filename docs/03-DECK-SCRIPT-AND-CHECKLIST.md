# Veriqo Deck — Presentation Script, Missing Assets & Integrity Check

**Files produced (in `veriqo/docs/`):**
- `Veriqo_AI_Builder_Cup_Deck.pptx` — editable PowerPoint, built on the official template (14 slides).
- `Veriqo_AI_Builder_Cup_Deck.pdf` — PDF preview of the same deck.

**Template fidelity:** exact AI Builder Cup cover band (logo + trophy) and Thank-you graphic reused from the official template; content slides reuse the real `Google Cloud · AI Builder Cup · H2S` header; section order preserved. Removed only the two instruction-only slides (the "download this template" note and the blank spare).

---

## 1. What YOU must still supply (the deck has clearly-marked placeholders)

| Priority | Slide | What's needed | Why |
|---|---|---|---|
| 🔴 **Gate** | 13 — Links | **GitHub public URL · 3-min demo video URL · deployed Final Product URL** | These three are the evaluation gates. A dead link or a non-demonstrative video stops evaluation. |
| 🔴 **Gate** | 10 — Snapshots | **3 real screenshots**: (1) Upload screen, (2) Report with evidence tags, (3) RC record + audit trail | Judges need to see the working prototype. |
| 🟠 High | 11 — Performance | **Your measured numbers**: visible-issue recall, false "all-clear" rate, median latency | Do NOT invent these — run the eval, then type the real figures. |
| 🟡 Confirm | 1 — Title | Confirm the **problem-statement wording** and team details (your message was cut off at "preliminary veh…") | Accuracy. |
| 🟡 Confirm | 9 — Cost | Confirm the RC provider and the indicative ₹ figures (left as "indicative, prototype-scale") | Avoid over-claiming. |

> Also decide the **video length rule** (your `submission.md` said 3–4 min; the public site says under 3). The template's Links slide says "3 Minutes" — safest to target ~2:50.

---

## 2. Presentation script (~3–3.5 minutes, follows slide order)

**S1 · Title (0:00–0:15)**
> "We're team Obscura — I'm Radhika, with Somya — and our project is Veriqo. Buying a used car in India is a trust minefield: buyers can't tell a car's real condition or registration status before they pay, so they overpay or get defrauded. Veriqo's promise: *know what to check before you buy.*"

**S2 · Brief (0:15–0:45)**
> "The buyer uploads a few photos and types the registration number. Gemini reads the photos for visible issues — dents, rust, tyre wear, paint mismatch. A registration lookup adds official facts like insurance validity and whether there's a loan on the car. Deterministic rules combine both into one clear report. Crucially, Veriqo is a *red-flag triage* — it tells you what to check. It never certifies a car as safe, and never treats a photo as proof of a hidden mechanical fault."

**S3 · Opportunities (0:45–1:10)**
> "Why different? Cars24 and Spinny only inspect cars they sell; independent inspections cost money and take a day. Nobody offers an instant, self-serve AI check for *any* car, including a private listing. Our USP is transparency: every finding is tagged by where it came from — Observed in your photos, read from the Record, Inferred by rules, or honestly marked Not-checked. The risk number is just the sum of published rules — no black box."

**S4 · Features (1:10–1:30)**
> "Photo condition analysis, registration verification, evidence-tagged findings, a transparent risk breakdown, a 'get this inspected' action list, and a shareable report with an audit trail. And when any source is simulated for this demo, the report says so, clearly."

**S5 · Process flow (1:30–1:50)**
> "One action in, one report out: buyer input, Gemini vision, the registration lookup, the deterministic rules engine, and the final report — saved with an audit trail. Every stage's output is traceable to its source."

**S6 · Wireframes (1:50–2:00)**
> "Two screens: upload on the left, the evidence-tagged report on the right."

**S7 · Architecture (2:00–2:25)**
> "A React app on Firebase Hosting talks to a FastAPI service on Cloud Run. Cloud Run calls Gemini 2.5 Flash on Vertex AI for the photos, the RC provider for registration data, and writes everything to Firestore with an append-only audit trail; photos live in Cloud Storage. Gemini perceives; Cloud Run decides; Firestore remembers."

**S8 · Technologies (2:25–2:35)**
> "So the stack is Gemini, Cloud Run, Firestore, Firebase and Cloud Storage — plus the registration provider and a React front-end."

**S9 · Cost (2:35–2:45)**
> "Costs sit largely within Google Cloud's free tiers; at low volume a report is a few rupees, dominated by the registration lookup."

**S10 · Snapshots / LIVE DEMO (2:45–2:55)**
> "And here's the working prototype." *(Show the live app or the screenshots.)*

**S11 · Performance (2:55–3:05)**
> "We measure visible-issue recall, the false all-clear rate — which we want at zero — and latency, a few seconds per report. *(State your measured numbers.)*"

**S12 · Future (3:05–3:15)**
> "Next: a live registration integration, history and odometer signals, multilingual voice reports, and a dealer API."

**S13 · Links + S14 · Thank you (3:15–3:25)**
> "Our code, demo video and live app are linked here. Thank you."

---

## 3. Technical & factual integrity — self-check (all pass)
- ✅ The deck distinguishes **Observed** (photo) vs **Record** (RC) vs **Inferred** (rules) vs **Not checked** — stated on slides 2, 3, 4, 5, 6.
- ✅ Never claims a photo proves a hidden mechanical fault or that a car is safe — "red-flag triage, not a certification" appears on slides 2 and 4.
- ✅ Mocked registration data is labelled **"Simulated in demo"** on slides 5, 7, 8 (and the app shows a SIMULATED-DATA banner).
- ✅ The risk category is explained as the **sum of published rules**, not a calibrated fraud probability (slides 3, 5, 11).
- ✅ No invented results — slide 11 leaves a placeholder for your real measured numbers; cost figures are labelled "indicative."
- ✅ No fake testimonials, partnerships, or unsupported market claims.

---

## 4. How to edit / re-export
- Open `Veriqo_AI_Builder_Cup_Deck.pptx` in PowerPoint (or Google Slides) and drop in the screenshots, numbers, and links.
- To regenerate the PDF after edits: `File ▸ Export ▸ PDF` (or `soffice --headless --convert-to pdf Veriqo_AI_Builder_Cup_Deck.pptx`).
