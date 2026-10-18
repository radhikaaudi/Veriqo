# Veriqo — Gemini Output Review (human-checked, before vs after)

The automated matrix (`docs/05-TEST-RESULTS.md`) checks **objective properties** of each report
(e.g. "a rust finding exists", "registration marked not verified"). Passing those checks does **not**
mean every statement Gemini made is correct. This page records what the model actually said, what
was wrong, what we changed, and what is still wrong.

- Model: Gemini 2.5 Flash on Vertex AI (`us-central1`), structured output.
- Photos: real Wikimedia Commons images (`test-assets/vehicles/`, licences in `test-assets/README.md`).
- Registration data: **simulated** synthetic fixtures (`backend/fixtures/rc_fixtures.json`).
- Baseline = Cloud Run revision `veriqo-api-00011-m2f` · After = `veriqo-api-00012-5z2`.
- Raw outputs: `tests/e2e/results/baseline-run1.json` (before) and `tests/e2e/results/results.json` (after).

## Problems found in the baseline run (revision 11)

| # | Problem | Evidence (baseline) | Why it matters |
|---|---|---|---|
| 1 | **Severity inflation + one defect split into many** | One long key scratch (C1) → 4 separate *severe* scratches → **100/100 (high)** — the same score as a blacklisted car. One door dent (C2) → 7 items. | A cosmetic scratch would scare a buyer off a fine car. |
| 2 | **Confidence measured coverage, not clarity** | Sharp close-ups of a bald tyre (E, 0.4) and a torn seat (F, 0.3) got *low* confidence → a false "Low photo confidence" penalty. | Penalised good evidence. |
| 3 | **View over-claiming** | One straight side photo reported as front + rear + left side + tyres + interior. A single front photo (I) claimed tyres + interior. | Defeats the "missing photo coverage" rule. |
| 4 | **Overclaiming through windows / in full-car shots** | Scratch photo (C1) produced a *worn tyre* and *interior damage* item from a wheel and a seat glimpsed through the window. | Findings not supported by the photo. |
| 5 | **Inconsistent between identical runs (Q)** | Same photo twice: run 2 dropped the interior-damage item. | Same input should give the same answer. |
| 6 | **Possible false positives on the clean car** | Clean 3-photo set (A-B) → 3 minor scratches incl. one on a *wheel*. | A clean-looking car must not look damaged. |

## Changes made

1. Prompt: explicit **severity rubric** (minor = cosmetic · moderate = needs bodywork/replacement · severe = structural/safety).
2. Prompt: **one item per distinct defect** (a scratch across several panels is one item).
3. Prompt: `overall_confidence` = **clarity of the photos**, not coverage (coverage has its own rule).
4. Prompt: **strict view rules** (a side profile is one side; `tyres` needs a tread close-up; `interior` needs an in-cabin photo).
5. Prompt: reflections, dirt, panel lines, normal tread and the blurred plate are not damage; no vague `other` items.
6. Generation: `temperature=0`, `seed=7`.
7. Scoring rule (published in the app): **visible-condition points capped at 60** — photos alone can make a car high-risk but never max out the score.

## After the fix (revision 12)

| Scenario | Baseline | After |
|---|---|---|
| C1 key scratch | 4 severe scratches + tyre + interior · **100 high** | 1 moderate scratch (3 panels) + minor mirror scuff · **26 medium** |
| C2 door dent | 7 items · 100 high | 6 items · 72 high (still many items — see open issues) |
| E bald tyre | conf 0.4, false low-confidence penalty | conf 1.0, **severe worn tyre**, no penalty |
| F torn seat | conf 0.3, rated severe + extra "carpet" item | conf 0.7, **one moderate seat-bolster tear** |
| G blurry | claimed front + left side | **no views claimed**, conf 0.1, no damage claimed ✅ |
| One side photo | claimed 5 views | claimed **left side** only ✅ (C1) |
| Q repeat of C1 | different items | **identical** band and items ✅ |
| A-B clean car | 3 minor scratches · 18 low | 2 minor bumper scuffs · 14 low |

## Still wrong / open issues (not hidden)

- **Headlight severity is inconsistent.** The VW's headlight lenses do show mild haze in `01-clean-front.jpg` (we checked the photo), so flagging it is defensible — but a single front shot rated it **moderate** (test I, two items, 46 medium) while the 3-photo set of the same car did not mention it. Gemini also still uses type `other` for it despite the instruction.
- **The dent photo (C2) still yields 6 items**, several rated severe, plus a "moderate" tyre-wear reading from a full-door photo where tread depth can't really be judged.
- **Views are still sometimes over-claimed** (e.g. `interior` for seats visible through an open window in Q/J).
- **Consistency was only checked with one repeat of one photo.** Gemini is not deterministic even at temperature 0; more repeats are needed before claiming stability.
- **No precision/recall number is claimed.** These are 11 photos reviewed by eye, not a labelled benchmark.

## What would make these numbers trustworthy

A labelled set of ~100 photo sets with mechanic-verified ground truth, reported as per-defect
precision/recall, plus 5 repeats per set to measure stability. Until then, Veriqo presents photo
findings as **Observed (with confidence)** — never as verified — and always lists accident history
and mechanical condition as **Not checked**.
