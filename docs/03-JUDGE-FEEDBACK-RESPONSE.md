# How Veriqo answers the judge's roast

`docs/roast.md` is a judge-style evaluation (estimated **77/100**, "promising, not proven",
ceiling ~86 with a strong build). Its deductions cluster on four things we could actually
*build*, not just *assert*. This doc maps each one to the concrete change we shipped.

> We deliberately did **not** touch the pitch's market statistics or the category question
> (Retail & Commerce vs. a Social Good tag). Those are framing/eligibility decisions for the
> team, flagged as open items at the bottom — the roast is right that they shouldn't be
> quietly asserted.

---

## The one idea behind every change: **provenance**

The roast's core fear is that Veriqo is "a Gemini photo-description tool attached to a
registration lookup API." The antidote, which it names three separate times, is
**evidence-linked verification**: every conclusion must declare where it came from and what
backs it.

So the atomic unit of a Veriqo report is now a **`Finding`** (`backend/models.py`), and every
finding carries:

| field | what it answers |
|---|---|
| `source` | `observed` (photo) · `record` (RC field) · `inferred` (rule over a record) · `not_checked` (honestly out of scope) |
| `evidence` | the exact photo panel or `RC: field = value` it was read from |
| `confidence` | Gemini's confidence for observations; `1.0` for hard record facts |
| `points` | how many risk points it added — so the score is auditable |
| `next_action` | the concrete thing the buyer should do about it |

The UI renders findings grouped by source with a four-badge legend, so a judge can *see* the
difference between "we observed this" and "the government record says this" and "we couldn't
check this." That distinction **is** the differentiator the roast asked us to demonstrate.

---

## Issue-by-issue

### Issue 1 — "Innovation is overstated / differentiation asserted, not shown"
**Roast's fix:** *"evidence-linked verification across independent sources. Every flag should
show the supporting photo region or official record, the confidence and the next action.
Demonstrate a mismatch a plain photo analyser or a standalone RC lookup would miss."*

**Shipped:**
- Every flag is now a provenance-tagged, evidence-linked `Finding` (above).
- The demo case `MH01AB1237` shows exactly the cross-source story: the photos look like a
  normal fair-condition car (**observed**, +33), but the record layer independently adds an
  **active loan** (+20, record), **expired insurance** (+12, *inferred* by date math), and
  **3 challans** (+9, record) — a combined **74/high** that neither a photo app nor a bare RC
  lookup would surface alone.

### Issue 2 — "Data integration is the biggest execution risk; don't show a green badge on mock"
**Roast's fix:** *"label mocked data prominently. Do not show a green verification badge when
the source did not return a result."*

**Shipped:**
- `RcRecord.source` drives a new `rc_verified` flag that is `true` **only** when the RC came
  from a live authoritative source.
- The report leads with a **SIMULATED DATA banner** whenever Gemini or the RC is mock, stating
  in plain words that it is *not government-verified*. A green "Live data" banner appears only
  when both are live — and even then it says "triage, not certification."
- The RC section header reads "VAHAN · simulated" vs "VAHAN · live" so the source is never
  ambiguous.
- `backend/vahan.py` already fails soft: a live-provider error falls back to mock labelled
  `live_error_fallback:<Error>`, so `rc_verified` stays false and the badge stays honest.

### Issue 3 — "The risk score is not scientifically justified"
**Roast's fix:** *"Show separate dimensions — visible-condition, registration-record, and
unknown/unverified. Explain the scoring rules."*

**Shipped:**
- `ScoreBreakdown` (`backend/scoring.py`) decomposes every score into **visible_condition +
  record + uncertainty**, and each dimension is literally the sum of its findings' `points` —
  there is no hidden number (asserted by `smoke_test.py`).
- The nine fixed weights are published in `SCORING_RULES` and shown in the UI under
  "How this score is calculated."
- The score header renders a **stacked breakdown bar** so the composition is visible at a glance.
- We did **not** invent a "maintenance-cost-₹" figure the roast called unjustified — the score
  is an explainable triage index, labelled as such.

### Priority 4 — "Run an honest evaluation. Don't manufacture a 9/10."
**Shipped:**
- `backend/eval_cases.json` — a documented, labelled test set (6 cases: clean, expired
  insurance, active loan, blacklisted, severe damage, low-confidence photos).
- `backend/eval.py` runs them through the **real** cross-check + scoring code and reports
  per-case pass/fail, aggregate accuracy, and latency. Current result: **33/33 checks,
  avg 0.19 ms** for the deterministic layer.
- Crucially, the harness **states what it does not measure**: Gemini's visual-detection
  accuracy, which needs a labelled photo set + `GEMINI_MODE=live` + human ground truth. We
  report no visual-accuracy number we have not actually measured.

### Bonus — the "real system" story (append-only audit)
- Every verification now writes a per-stage **audit trail** (`gemini → vahan → scoring →
  created`) with the key output of each step, retrievable via `/api/report/{share_id}` and
  shown in the UI under "Audit trail — how this report was produced." This makes the
  "persistent audit records" claim demonstrable, not just architectural.

---

## What we intentionally left for the team (not code)
- **Market statistics** (30% hidden-accident, 20–25% defects, "no national history DB"): the
  roast flags these as `[UNKNOWN]`. Source them or soften the wording before the demo.
- **Category eligibility**: confirm with organizers whether Retail & Commerce alone satisfies
  the submission form, or whether a Social Good / listed-category tag is also required.
- **Live VAHAN provider**: run a real provider against several valid plates and record which
  fields come back (coverage/latency) before claiming full RC field support.
