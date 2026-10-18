# Milestone 3 — campaign pack and release readiness

Prepared while Milestone 2 development continues. Finalized against **Milestone 1's actual evidence**
(the 2026-10-01–03 Instagram campaign audit, `docs/execution/SITUATIONS_REDESIGN.md`) and **Milestone 2's
actual capabilities** (what's genuinely built and tested today, not what's planned) — not assumed from
either. **This document proposes; it activates nothing.** No ad spend, merge, deployment, OTP activation,
or customer-data sharing is authorized by anything in this pack.

## Before the concepts: what's actually true right now, checked directly this round

- **`sutriva.io` is live and publicly reachable** — confirmed by a direct, read-only HTTP check this
  round: `HTTP 200`, no Basic Auth challenge, `X-Robots-Tag: noindex, nofollow` still present (not indexed,
  but directly reachable by anyone with the link). This matches `docs/decision_log.md`'s 2026-09-27 public-
  launch risk acceptance for commit `ac9c1b352...`.
- **All three concepts' direct-link destinations are live right now**, checked the same way:
  `/borrow-better?situation=offer` → 200, `/money-value?situation=fee` → 200, `/borrow-better?situation=purchase`
  → 200.
- **PR #33 (campaign-tracking-fixes) is open, not merged** (`mergeStateStatus: CLEAN`, confirmed via `gh`)
  — the currently-live site does not yet have its two fixes. **Checked precisely, not assumed, whether this
  blocks a direct-situation-link campaign**: it does not. PR #33's two fixes are (1) the group-chooser
  page's own view event, and (2) reliable delivery of the home page's `door_selected` click event — both
  specific to a visitor landing on the **chooser** (`/borrow-better` or `/money-value` with no
  `?situation=`) and clicking a door card. A campaign using `?situation=<key>` bypasses the chooser
  entirely; per `SITUATIONS_REDESIGN.md`'s own verification, "a `?situation=` URL skipped the chooser and
  persisted only the situation's own arrival view" — already working, independent of PR #33. The
  zero-dwell/`sendBeacon`-racing limitation documented there is also specific to a click that triggers an
  in-app navigation (the door card); a cold landing from an ad has no such race — it uses the ordinary
  `fetch`-based `step_viewed` call, which *can* retry after the session-bootstrap call, unlike the beacon
  path. **Conclusion: a direct-situation-link campaign does not need PR #33 merged first.** PR #33 remains
  good, already-reviewed work worth merging on its own schedule — this is not a reason to delay it, only a
  correction that it isn't a hard dependency for this specific campaign pattern.
- **Campaign attribution capture (`campaign_attribution`, UTM → session linkage) predates all of this** —
  it's part of the foundational Phase B anonymous-continuity work (migration `0002`), confirmed present on
  `main` independent of PR #33's diff (which touches no attribution-capture file at all). It is not a new
  or fragile capability.
- **The prior real campaign's headline number (1,488 sessions, ~25 with any further event) is explained,
  not representative of true engagement** — that campaign used bare chooser URLs (no `?situation=`), which
  is exactly the measurement gap PR #33 fixes. It should not be read as "96% of visitors did nothing";
  it's largely a measurement artifact of the URL pattern used, not a conversion fact. Stated here so the
  budget section below doesn't anchor on a misleading number.
- **Not yet done, confirmed**: a real-device test inside the actual Instagram app (as opposed to a
  realistic local-stack simulation with a captured Instagram-WebView user agent, which has been done). This
  is the one concrete gap standing between "the mechanism works in simulation" and "proven on the device
  real traffic will actually use."

## Verifying the purchase check before Concept 3

Per instruction not to create a separate product unnecessarily: checked `services/api/app/services/
situations.py::calculate_new_purchase` directly. Its result `title` is literally **"Money left after this
EMI"**, computed as `income − costs − proposed EMI`, with a bars chart of current costs vs. proposed EMI.
This is already, exactly, "before you buy, see what is left for the rest of your month" — not an
approximation of the concept, the concept itself, already built, already live. **Concept 3 requires zero
product development** — only new ad creative and copy around the existing `purchase` situation key.

---

## Concept 1 — Loan-offer reality check

**Customer problem and hypothesis.** Visitors comparing loan offers often anchor on the EMI alone; a lower
EMI can come from a longer tenure, which increases total interest paid — a trade-off that isn't obvious
from the EMI number by itself. Hypothesis: surfacing the implied annual rate and total interest next to the
EMI creates a genuine "I didn't realize that" moment, driving completion and registration more than a
generic "compare loans" message would.

**Static copy.**
- Headline: "A lower EMI can still mean a costlier loan."
- Body: "See what a loan offer actually costs — not just the monthly number. Takes under a minute, no sign-up, no phone number."
- CTA: "Check your offer"

**Short video script (≈15s)**
1. (0–3s) On-screen text: "Offered a lower EMI?" — a phone showing a loan-offer message mockup.
2. (3–8s) "That could mean a longer loan — and more interest overall." Visual: two bars, same loan amount, different tenure, different total interest.
3. (8–12s) "See the real cost of your offer in under a minute." Screen recording of the actual Sutriva "offer" check being filled in.
4. (12–15s) Logo + "sutriva.io — no sign-up needed." End card.

**Exact destination and supported output.** `https://sutriva.io/borrow-better?situation=offer` — the
live, built, already-tested "Loan offer" check. Output: estimated interest, implied annual rate, money left
per month, a one-line "what if the EMI were lower" scenario. Confirmed reachable (200) this round.

**Registration benefit and contact fields.** The existing, already-deployed **pilot-interest** form only —
email address, nothing else. Copy: "Leave your email if you'd like an invitation when a deeper version is
ready." **Not** the saved-check feature (unreleased, flag off) and **not** framed as saving this specific
result — registering interest in a future invitation only, matching this project's own standing naming
discipline.

**Permission and follow-up process.** No consent checkbox exists on this form by design (submitting it is
registering interest, not opting into marketing — see `situation_pilot_interest`'s own migration). **Gap,
stated plainly, not papered over**: there is no follow-up process of any kind behind this email capture
today — no CRM, no response pipeline, no scheduled "invitation" email exists anywhere in this codebase.
The copy must not promise a specific follow-up timeline or outcome; it already doesn't ("when it's ready to
test," not "we'll email you this week").

**Fulfilment/monetisation dependency.** None. This is a purely informational, anonymous check — no lender,
no partner, no referral, no claim of approval odds or rates.

**Metrics and readiness.** Arrival `step_viewed`, `step_completed` (inputs filled), `result_declared`,
pilot-interest submission rate, `campaign_attribution` capture rate, bounce rate before first event.
**Readiness: ready.**

---

## Concept 2 — Card-fee review

**Customer problem and hypothesis.** Cardholders often keep paying an annual fee without checking whether
their actual redeemed rewards value exceeds it. Hypothesis: a direct "ahead by / short by ₹X" framing is
concrete and slightly provocative enough to drive a quick check.

**Static copy.**
- Headline: "Did your card earn its annual fee?"
- Body: "Compare what you actually redeemed against what the card charged you. One minute, no sign-up."
- CTA: "Check your card"

**Short video script (≈15s)**
1. (0–3s) "Still paying that annual fee?" — a credit card mockup.
2. (3–8s) "Did it actually pay for itself in rewards?" Visual: a simple scale, rewards vs. fee.
3. (8–12s) Screen recording of the actual "fee" check and its "Ahead by ₹X" / "Short by ₹X" result.
4. (12–15s) Logo + "sutriva.io — no sign-up needed." End card.

**Exact destination and supported output.** `https://sutriva.io/money-value?situation=fee` — the live
"Annual fee" check. Output: redeemed rewards vs. fee, net ahead/short figure. Confirmed reachable (200)
this round.

**Registration benefit and contact fields / permission and follow-up / fulfilment.** Identical to Concept
1 — same existing pilot-interest email-only form, same stated gap (no follow-up pipeline exists), same "no
partner, no monetisation dependency."

**Metrics and readiness.** Same metric set as Concept 1, scoped to the `fee` situation key.
**Readiness: ready.**

---

## Concept 3 — Festive purchase scenario (within B1, reusing the existing `purchase` check)

**Customer problem and hypothesis.** Festive-season purchases (electronics, appliances, travel) are often
financed with an EMI quoted at the point of sale, without checking what that commitment leaves for the
rest of the month's other expenses. Hypothesis: a seasonally-timed "before you buy" framing catches people
at the actual decision moment, not after.

**Static copy.**
- Headline: "Before you buy, see what's left for the rest of your month."
- Body: "Enter the price and the EMI you've been quoted — see what you'd have left each month, before you commit."
- CTA: "Check before you buy"

**Short video script (≈15s)**
1. (0–3s) Festive sale imagery, "₹X EMI, no cost* financing" style ad mockup.
2. (3–8s) "But what does that leave you each month?" Visual: income bar shrinking after EMI + existing costs.
3. (8–12s) Screen recording of the actual `purchase` check: price, EMI, tenure, income, costs → "Money left after this EMI."
4. (12–15s) Logo + "sutriva.io — see it before you commit." End card.

**Exact destination and supported output.** `https://sutriva.io/borrow-better?situation=purchase` — the
**existing, unmodified** "New purchase" check (verified above — no new development). Output: "Money left
after this EMI" headline, a shortfall warning if the EMI doesn't fit. Confirmed reachable (200) this round.

**Registration benefit and contact fields / permission and follow-up / fulfilment.** Identical pattern to
Concepts 1 and 2.

**Metrics and readiness.** Same metric set, scoped to the `purchase` situation key. If timed to an actual
festive period, add a time-boxed cohort window (see Measurement section) so results aren't diluted by
non-festive traffic. **Readiness: ready** (zero development; a creative/timing decision only).

---

## Recommendation: ONE first campaign

**Concept 1 — Loan-offer reality check.** All three concepts are equally *ready* technically; the
differentiator is the strength of the hook and strategic fit, not readiness:

- The "lower EMI, costlier loan" insight is the most counter-intuitive of the three, which plausibly means
  higher ad engagement — a card-fee check or a purchase check are more passively "informational," while a
  loan-offer reality check directly challenges a decision-point mental model.
- Borrowing decisions are typically higher-stakes than a card-fee review, giving the check more reason to
  be taken seriously and finished rather than abandoned.
- This project's own earlier work has repeatedly treated the loan-offer situation as a "lead path" example
  in its own test naming and documentation — not proof of a product decision, but a small, consistent
  signal in the same direction.

Concept 3 (festive purchase) is a strong **second choice specifically if timed to an actual festive
period** — recommend holding it for that window rather than running it as a generic, undated campaign,
since its hook depends on seasonal timing for full effect.

**What this campaign does NOT advertise, per explicit instruction**: no mention of saving a result, no
mention of a review or follow-up service, no mention of credit bureau data, no mention of lending,
approval odds, rates, or disbursal. The ad and landing experience are exactly what's live today: an
anonymous check plus an optional, unprocessed "register interest" email field.

---

## Measurement and budget — proposed, not activated

- **Media ceiling**: ₹3,000, excluding taxes, not yet spent, not yet authorized to spend.
- **Review checkpoint**: at ₹1,000 spent — a deliberate pause point to look at the data before continuing,
  not a formality.
- **Immediate-pause triggers** (checked continuously, not only at the ₹1,000 checkpoint):
  - The destination journey is broken (result doesn't load, a 500 error, a blank screen) for any sampled
    real click.
  - Event persistence fails — a direct database spot-check shows sessions being created but no
    corresponding `step_viewed`/`result_declared` rows, which would mean money is being spent on traffic
    this project cannot even see.
  - Attribution is unusable — `campaign_attribution` rows don't carry a parseable `utm_campaign` value
    matching what was actually bought, making spend-to-outcome linkage impossible.
- **Checkpoint decisions based on progression, usefulness, and feedback — not cost-per-click alone**:
  at ₹1,000, look at arrival→inputs→result completion rate (progression), whether visitors who reach a
  result spend meaningful time there rather than bouncing instantly (usefulness), and the pilot-interest
  submission rate as a weak but real proxy for "this was worth leaving a contact for" (feedback) — not CPC
  or raw click volume in isolation, which the standing instruction explicitly warns against over-reading.
- **Timezone**: Asia/Kolkata (IST) for every date/time boundary in this campaign's reporting — matching the
  product's own target market, not the ad platform's default UTC reporting.
- **Cohort definition**: an anonymous session is in this campaign's cohort if its first-touch
  `campaign_attribution` row carries this campaign's specific `utm_campaign` value and its `created_at`
  falls within the campaign's declared IST start/end window.
- **Disclosed test exclusions**: the founder's own device/IP and any explicitly-tagged QA session (a
  distinguishable `utm_source=internal_qa` or equivalent) are excluded from reported numbers, and this
  exclusion is stated in every report, not silently applied.
- **Sparse outcomes cannot establish stable conversion economics** — a ₹3,000 budget at realistic Indian
  CPC/CPM rates will produce a small number of sessions; this pack does not claim, and no report from it
  should claim, a stable cost-per-registration or conversion-rate figure from this alone. It is a readiness
  and measurement-pipeline test, not a statistically powered experiment.

---

## Release gates — go/no-go, each assessed separately

### Gate A — Anonymous-check campaign

| Requirement | Status |
|---|---|
| Working destination/check | ✅ Met — confirmed live, 200, this round |
| Tested email persistence | ✅ Met — pilot-interest form already smoke-tested at deployment (PR #32) |
| Interpretable tracking/attribution | ✅ Met for direct-situation-link entry — confirmed architecturally independent of PR #33's unmerged fixes, per the analysis above |
| Real-device evidence | ❌ **Not met** — simulation only (real browser, captured Instagram UA, local stack); no test yet on an actual phone inside the real Instagram app |
| Approved copy and budget | ❌ **Not met** — this pack proposes copy and a ceiling; neither is approved yet |

**Go/No-Go: NOT YET GO.** Two concrete, closeable items stand between here and Gate A: (1) one real-device
test (tap the actual campaign link from an Instagram DM/post on a real phone, confirm the session and
first event persist), (2) your explicit approval of the copy and the ₹3,000/₹1,000 figures. Everything
else is ready.

### Gate B — Saved-output/verified-contact campaign

Requires Gate A, plus: actual saving/retrieval working in production (today: built and tested, but
`savedCheckEnabled=false` everywhere, no real email provider configured), Twilio where needed (blocked —
see the Twilio status below), permission records (proposed only, not implemented), retention/deletion in
production (built and validated this round, not installed on any host), controlled rollout (not started).

**Go/No-Go: NO-GO**, by a wide margin — most of this gate's dependencies are genuinely not ready, not
merely unapproved.

### Gate C — Assisted borrowing/partner campaign

Requires relevant preceding gates, plus a named operational partner with written eligibility criteria,
response times, payout/disclosure terms, data-sharing terms, outcome reporting, approved claims, a pilot
cap and exit terms, and end-to-end test cases.

**Go/No-Go: NO-GO**, trivially — no partner relationship of any kind exists anywhere in this engagement
today. No guaranteed-approval, rate, disbursal, or bureau-retrieval claim is authorized at any gate, and an
email address or a verified phone number is never, by itself, a qualified lending case.

---

## Reporting — persisted records as truth

Only a database row counts as a registration or an event for reporting purposes — a client-side event that
never reached the server (the exact failure mode PR #33 fixes for one specific path) is not "truth" just
because an ad platform's own pixel fired. Reported **separately**, not blended into one conversion number:

- **Contact submitted** — a `situation_pilot_interest` row exists (email registered).
- **Phone verified** — not applicable to Gate A; would come from `pilot_registrations.status = 'verified'`
  once Gate B's OTP work is live.
- **Service requested** — not applicable to Gate A; would come from a `saved_borrow_checks` row (or a
  future assisted-review request) once Gate B exists.
- **Permission recorded** — not applicable yet; would come from the proposed `permission_records` table
  once built.
- **Partner handoff** — not applicable; no partner exists (Gate C).
- **Outcome** — not applicable; no partner, no outcome to report.
- **Payable event** — not applicable; nothing in this engagement is monetised yet.

For Gate A specifically, the only two real, reportable numbers are **sessions attributed to this campaign**
and **contact submitted** — reported as exactly that, not inflated with any gate-B/C terminology this
campaign doesn't actually reach.

---

## Deployment / rollback notes

**Deployment**: this campaign requires **no code deployment at all** — it points to URLs already live on
`sutriva.io` today. The only "deployment" action is configuring the ad platform (destination URL, UTM
parameters, creative, budget) — nothing in this repository changes to launch it.

**Rollback**: pausing or stopping the ad campaign in the ad platform is the entire rollback — there is no
corresponding code or database rollback, since nothing was deployed. If a mid-campaign code change *is*
separately deployed (e.g., PR #33 merges while this campaign is live), see the measurement-change note
below; pausing the ad spend remains independent of and unaffected by that.

## Measurement-change date requirements

If any tracking-relevant code changes while a campaign is active (an event schema change, a new/changed
screen name, an attribution-logic change — e.g., if PR #33 merges mid-flight), the exact deploy timestamp
(IST) must be recorded, and any before/after comparison of campaign metrics must either exclude the
transition window or explicitly segment reporting across that boundary — never blended into one number as
if measurement stayed constant throughout. This is a standing rule for this and any future campaign using
this pack as a template, not a one-time note.

---

## External-task table

| Owner (role) | Task | Needed by | Evidence it's done | What it unblocks |
|---|---|---|---|---|
| Founder/product owner | Approve campaign copy (Concept 1) and the ₹3,000/₹1,000 figures | Before any ad spend | Written approval | Gate A go |
| Founder/whoever has a phone with Instagram | Run the real-device test script (tap the actual link from a DM/post, confirm session + arrival event persist) | Before any ad spend | A confirmed DB row for that session | Gate A go |
| Founder/account owner | AWS SES domain verification + credentials | Before Gate B work can start | SES console shows "Verified" | Gate B's email dependency |
| Founder/account owner | Twilio written answer on the content-restriction question | Before any real OTP test | A reply, or instruction to send the prepared follow-up | Gate B's Twilio dependency |
| Founder/account owner | SSH access restored to `sutriva-alpha` | Before PR #33, #34, or #35 can ever be deployed, and before the retention scheduler can be installed | A successful SSH connection | All deployment-dependent work |
| Founder/account owner | A named operational partner, with written terms | Before any Gate C work begins | A signed or draft agreement | Gate C entirely |

**Missing items (an export, a credential, partner terms, a phone) block only the specific downstream work
named above — not the rest of this pack**, which remains valid and actionable independent of any one row.
