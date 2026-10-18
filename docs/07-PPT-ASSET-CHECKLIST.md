# Veriqo deck — slide-by-slide asset checklist

Deck: `docs/Veriqo_AI_Builder_Cup_Deck.pptx` (+ `.pdf` preview), built by `scripts/build_deck.py`
on the official AI Builder Cup template (header, cover and thank-you art extracted from
`docs/Submission Template _ AI Builder Cup.pdf`; slide order unchanged; the two instruction-only
template pages removed). Previous version kept in `docs/archive/`.

Rule followed: **no AI-generated product screenshots, no invented numbers, no claimed integrations
that aren't running.** The reference mockups supplied during planning were NOT used.

| # | Slide | Asset used | Source | Status |
|---|---|---|---|---|
| 1 | Team details | Template cover band | Official template PDF | ✅ |
| 2 | Brief | Text; "9.8 s median" | Measured, `tests/e2e/results/results.json` | ✅ |
| 3 | Opportunities | Provenance chips | Brand palette | ✅ |
| 4 | Features | Text only — every feature listed is implemented and tested | Code + `docs/05-TEST-RESULTS.md` | ✅ |
| 5 | Process flow | Diagram of the real pipeline | `backend/main.py` order of operations | ✅ |
| 6 | Wireframes | **Real screens:** `demo-assets/screenshots/02-upload-filled.png`, `05-findings.png` | Captured from the live app (`tests/e2e/screenshots.js`) | ✅ |
| 7 | Architecture | Diagram of services **actually running** in `veriqo-512010`; registration lookup shown as simulated; Firebase Hosting/Auth stated as not used | `gcloud run services describe`, bucket + Firestore checks | ✅ |
| 8 | Technologies | Text — only what is in the code/deployment | Repo | ✅ |
| 9 | Cost | Indicative table, labelled as estimates | — (no billing data claimed) | ✅ labelled estimate |
| 10 | Snapshots | **Real screens** (cropped to the app column): `04-report-summary.png`, `06-checklist.png`, `07-rc-not-verified.png` | Live app | ✅ |
| 11 | Benchmarking | Measured results only: 21/21 API, 67/67 rule checks, 15/15 browser (first run 14/15), 9.8 s median; model review before/after | `backend/tests/`, `backend/eval.py`, `tests/e2e/matrix.js`, `docs/05b-MODEL-REVIEW.md` | ✅ |
| 12 | Future | Text | — | ✅ |
| 13 | Links | GitHub + live URL filled; **video link is a placeholder** | — | ⚠️ add video link after upload |
| 14 | Thank you | Template art | Official template PDF | ✅ |

## Other screenshots available (not in the deck)

`demo-assets/screenshots/`: `01-upload-empty.png`, `03-analyzing.png` (real in-progress state),
`08-mismatch.png`, `09-blurry-uncertain.png`, `10-mobile-report.png`, `11-record-simulated.png`,
`12-report-dark.png`, plus one full-page capture per test in `tests/` (after fixes) and
`tests-baseline/` (before fixes).

## Before submitting

- [ ] Record the demo video (`docs/06-DEMO-RECORDING-SCRIPT.md`), upload, paste the link on slide 13, rebuild (`python scripts/build_deck.py`).
- [ ] Push the latest code so the GitHub link on slide 13 shows the tested version.
- [ ] Re-export the PDF after any edit.
