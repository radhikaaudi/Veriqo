# Veriqo — Demo Video Recording Script (live data, ~2:45)

Record against the **deployed app** (live Gemini 2.5 Flash on Vertex AI, Firestore, Cloud Storage):
**https://veriqo-api-920194228751.us-central1.run.app**
(Local mock mode is NOT live data — don't record that.)

## Before you press record (5 minutes)

1. **Browser:** Chrome, new Incognito window, zoom 100%, window about 1440×900. Light theme (moon icon visible top-right).
2. **Warm-up:** run one full verification first (any test plate + one photo), then click **Verify another car**. That way the first analysis on camera isn't a cold start.
3. **Files ready:** open `veriqo/test-assets/vehicles/` in Finder next to the browser, so you can drag photos in.
4. **Quiet screen:** turn on Do Not Disturb; hide bookmarks bar (⌘⇧B); close other tabs.
5. **Recorder:** macOS ⌘⇧5 → *Record Selected Portion* → Options → Microphone: your mic. Or use OBS/Loom.
6. **Closing slide ready (optional):** open `veriqo/demo-assets/video/cards/closing.html` in a second tab.
7. **Rule for the whole video:** Gemini's wording changes slightly between runs. **Read what is on screen; never say a finding that isn't shown.**

## The script

| Time | On screen / action | Say (approx.) |
|---|---|---|
| **0:00–0:15** | App home page, not scrolled. | "Buying a used car means trusting photos and paperwork you can't verify. Veriqo shows a buyer what the photos reveal, what the record says, what's still uncertain — and what to check before paying." |
| **0:15–0:35** | Type registration **`ZZ01TC0002`**. Type listing **`Hyundai Verna`**. Drag in **01-clean-front, 02-clean-side, 03-clean-rear, 07-worn-tyre, 08-interior-damage**. Point at the numbered thumbnails. | "This is the live app on Google Cloud Run. I enter the registration number and the make and model from the seller's listing, then upload five photos. These are openly licensed test photos, and this plate is a synthetic test plate — the registration lookup in this demo is simulated." |
| **0:35–0:55** | Click **Verify car**. Keep the *Verifying your car…* panel on screen while it works (10–20 s, real). | "Gemini 2.5 Flash on Vertex AI is reading every photo now and returning structured findings — each one tied to the photo it came from. Then a deterministic rules engine combines them with the registration record. Nothing here is pre-recorded; this wait is the real model working." *(Keep talking until the report appears.)* |
| **0:55–1:15** | Report appears. Point at the **score ring**, then the **breakdown bar** under the summary. | "Here's the result: *(read the score and band shown)*. The score isn't a guess — it's the sum of fixed, published rules, and this bar shows exactly how many points came from the visible condition, the record, and uncertainty." |
| **1:15–1:50** | Scroll slowly through **Findings**. Pause on each group header. | "Every finding has one of four labels. **Observed** — seen in the photos, like *(read one, e.g. the worn tyre — note the photo thumbnail)*. **Record** — read from the registration data, like the active loan and pending challans. **Inferred** — a rule applied to that data: the insurance date is in the past, so it's expired. And **Not checked** — what photos can never prove, like accident history or the engine." |
| **1:50–2:05** | Scroll to **Registration record**; point at the **SIMULATED — NOT GOVERNMENT VERIFIED** tag. | "This record is synthetic test data, so it's labelled simulated, not government verified — in the banner, the labels and here. A live provider would replace it." |
| **2:05–2:15** | Scroll to **What to check before paying**. | "And here's what the buyer actually gets: a prioritised checklist of what to do before paying." |
| **2:15–2:25** | Click **Copy report link**, then press **⌘R** to reload. The report comes back. | "The report is saved in Firestore, with the photos in a private Cloud Storage bucket. Reload the link, and the same report comes back." |
| **2:25–2:45** | Click **Verify another car**. Plate **`ZZ99NOREC0`**, photo **09-blurry-car**, Verify. When it loads, point at the **banners** and the **No registration data** box. | "Finally, a failure case: a blurry photo and a plate with no record. Veriqo lowers its confidence, doesn't make confident claims it can't see, and marks the registration as *not verified* — instead of inventing data." |
| **2:45–2:55** | (Optional) switch to the closing-slide tab. | "Under the hood: Cloud Run, Gemini on Vertex AI, Firestore and Cloud Storage — with automated API tests and a browser test suite run against this deployment. Veriqo: know what to check before you buy." |

## If you have spare time (optional 15 s, after the failure case)

Plate **`ZZ01TC0004`**, listing **`Honda City`**, photo **01-clean-front**, Verify → scroll to *Registration record*:
> "If the seller's listing says Honda City but the record says Maruti Swift, Veriqo flags the mismatch and tells the buyer to check the chassis number in person."

## If something goes differently on camera

- **Analysis takes longer than 20 s:** keep talking ("structured output means every field is typed and validated…"). If it fails, the app shows a clear error and saves nothing — re-take.
- **Gemini reports a slightly different finding:** describe exactly what's on screen.
- **A finding looks wrong to you:** don't defend it. Saying "photos can be misread, which is why the score shows confidence and the report sends you to a mechanic" is a strength.
- **Don't say:** "verified", "accurate", "detects fraud", or "certifies the car". **Do say:** "observed", "simulated", "not checked", "what to inspect".

## After recording

- Trim dead air at the start and end only. Don't cut the analysis wait to make it look faster than it is.
- Export 1080p MP4, check it's **under 3 minutes**, and upload (YouTube unlisted or Google Drive, anyone-with-link).
- Paste the link on deck slide 13 (*Demo Video Link*).
