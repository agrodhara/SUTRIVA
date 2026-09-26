# Phase 1.1A situations redesign

This is the reference for the redesigned Phase 1.1A customer experience: the real, responsive web
implementation that replaced the single, five-step Borrow Better / Money Value journeys with nine narrow,
single-question "situation" checks, plus the post-result pilot-interest email handoff added afterward. It
exists because `services/api/app/services/situations.py` and
`apps/pwa/app/situations/situationsConfig.ts` both point here as their single source for the product
rationale behind the calculations and copy they implement.

Ships entirely behind the pre-existing `track11aEnabled` flag (see `shared/track11_config.json`), unchanged
mechanism from every earlier 1.1A/1.1B decision in this log. The committed flags stay `false`/`false`;
`LegacyBorrowBetterPage` / `LegacyMoneyValuePage` remain the exact flag-off fallback, byte-for-byte
untouched.

## Origin

The redesign turns `Sutriva-final-web-mockup.zip` (a dense, complete, data-driven specification — exact
copy, field definitions, calculation formulas and validation rules for all nine situations) into the real
customer-facing site: landing → arrival → inputs → result, for each situation, reachable either by
choosing it from a group landing page or by a campaign URL that opens it directly. The mockup was treated
as design/copy reference, not production code — every calculation lives server-side
(`services/api/app/services/situations.py`), never in React.

## The nine situations

| Group | Key | Nav label | Screen-name base |
|---|---|---|---|
| Borrow Better | `debt` | Rising EMIs | `borrow_debt` |
| Borrow Better | `purchase` | New purchase | `borrow_purchase` |
| Borrow Better | `offer` | Loan offer (lead path) | `borrow_offer` |
| Borrow Better | `rejected` | Rejected or shortfall | `borrow_rejected` |
| Rewards Intelligence | `fee` | Annual fee (lead path) | `rewards_fee` |
| Rewards Intelligence | `fit` | Card and spending fit | `rewards_fit` |
| Rewards Intelligence | `balance` | Carrying a balance | `rewards_balance` |
| Rewards Intelligence | `multi` | Several cards | `rewards_multi` |
| Rewards Intelligence | `unused` | Unused points | `rewards_unused` |

One shared engine (`apps/pwa/app/situations/SituationFlow.tsx`) renders all nine, parameterized by a single
`SITUATIONS` config object (`situationsConfig.ts`) — mirroring the mockup's own JS pattern. A group landing
page (`SituationLanding.tsx`) offers a choice grid; `SituationsApp.tsx` reads `?situation=<key>` on mount so
a campaign URL opens its matching situation directly, without the visitor re-choosing it. The query string
never carries anything beyond that one categorical key — no financial figure is ever placed in a URL.

## Provenance: example / mixed / own

Every result is labelled with exactly one of three states (`ProvenanceBadge.tsx`), never a single blanket
"illustrative only" label for every result:

- **`example`** — untouched example figures: "ILLUSTRATIVE EXAMPLE — NOT YOUR DATA".
- **`mixed`** — at least one example field was edited, but not every field was (re-)entered: "EXAMPLE
  FIGURES + YOUR EDITS — PARTLY YOUR DATA".
- **`own`** — every required figure was entered by the visitor (via "Use my figures", which clears every
  field first): "BASED ON WHAT YOU TOLD US — YOUR DECLARED FIGURES".

Editing one prefilled field never claims the result is the visitor's own data — this is enforced in
`SituationFlow.tsx`'s `chooseMode`/`updateField` state machine and covered by
`SituationFlow.test.tsx`.

Each situation's fixed `gap` copy states its own specific limitation next to the result (never a generic
disclaimer): a loan offer cannot say whether another lender would approve or offer a better rate; a
purchase check does not include running costs; card-fit rates are explicitly hypothetical, never a verdict
on the visitor's actual card; the annual-fee check never implies cancelling a card erases interest already
charged and is never a keep/cancel/upgrade recommendation; unused-points and carrying-a-balance never
invent an unknown conversion rate or interest figure.

## No raw financial values in analytics or URLs

`trackEvent` calls from the situations flow only ever pass `journeyRunId` and a bounded, categorical
`screenName` — never an entered figure, never in a URL. This is enforced by construction (the call sites
have no other data to pass) and unit-tested directly (`SituationFlow.test.tsx` asserts every tracked call's
details object has exactly the keys `["journeyRunId","screenName"]` and that its JSON never matches any
entered number).

## The pilot-interest email handoff (added 2026-09-26)

A consolidated product correction (Copilot review + founder decisions) replaced each situation's original
static, non-interactive "a future pilot may…" sentence with one real, optional, post-result handoff:
`apps/pwa/app/situations/PilotInterestForm.tsx`, rendered only inside `SituationFlow`'s result step.

**Copy is fixed and identical across every situation** (heading "Interested in the Sutriva pilot?", body
"We're building a deeper version of this check. Leave your email if you'd like an invitation when it's
ready to test.", field "Email address", button "Register my interest", success "Thanks — we've registered
your interest. We'll email you when the Sutriva pilot is ready."). It collects exactly one field — no name,
phone number or consent checkbox exists on the form — and submitting it is registering interest in an
invitation, not opting into promotional updates; there is no consent column on its table at all.

**Never before a result, never required.** The form only exists inside the result screen's render branch;
finishing a check ("Adjust figures") or exploring another situation works identically whether or not the
form was touched.

**Server-side persistence, not a fake success screen.** `POST /v1/situation-pilot-interest`
(`app/routers/situation_pilot_interest.py`) validates the email, derives the journey from `situation_key`
server-side (a client cannot send its own `journey`), and inserts into `situation_pilot_interest`
(migration `0007_situation_pilot_interest`) with `ON CONFLICT (email, situation_key) DO NOTHING` — a repeat
submission of the same email for the same situation is idempotent (same success copy, no duplicate row);
the same email registering interest from a *different* situation is a distinct, legitimate row, since the
table's job is to tell the operator which situations generated interest. A database failure raises a real
503 (`service_unavailable`), which the frontend surfaces as an inline error — it never shows the success
copy for a submission that was not actually saved.

**Protections:** origin validation (`validate_request_origin`, the same check every other state-changing
route uses) and a per-IP `FixedWindowRateLimiter` (`SITUATION_PILOT_INTEREST_SUBMIT_PER_IP_PER_HOUR`,
default 10/hour) on the submit route; the whole feature 404s (indistinguishable from a route that doesn't
exist) when `track11aEnabled` is false, mirroring how `app/routers/pilot.py` gates Phase 1.1B. A best-effort
anonymous-session link is recorded when a valid session cookie is present, but a missing or invalid cookie
never blocks a submission.

**Operator retrieval, not a public API.** `GET /v1/situation-pilot-interest/admin/export` is excluded from
the OpenAPI schema (`include_in_schema=False`), not linked from the frontend anywhere, rate-limited
separately, and fails closed with a 404 (not a hint-bearing 401) when
`SITUATION_PILOT_INTEREST_ADMIN_TOKEN` is unset — exactly like an unconfigured SMS provider or OTP signing
key elsewhere in this codebase. With the token configured, it requires an exact `X-Admin-Token` header
match and returns `{uuid, journey, situation_key, email, created_at}` rows, newest first
(`?limit=`/`?before=` for pagination). This is the only surface anywhere in the product that ever returns
an email address; it never appears in analytics, a URL, or an application log line.

**Analytics stay non-sensitive.** One new event type, `situation_pilot_interest_submitted`, and one new
screen name per situation (`{screen_base}_pilot`, e.g. `rewards_fee_pilot`) added by migration `0007` —
distinct from Phase 1.1B's unrelated `pilot_interest_clicked` event. The form's own appearance is reported
with the existing `step_viewed` event type (the pilot screen names are step names too); only its
submission uses the new dedicated event type. Neither carries anything beyond the fixed `screenName`/
`journeyRunId` pair — there is no field on the event schema an email (or any other value) could occupy.

**Phase 1.1B stays untouched.** This addendum does not read or write `pilot_registrations`, `otp_challenges`
or `otp_sends`, does not flip `track11bEnabled`, and does not alter the OTP/mobile-verification consent
model in any way. `PilotHandoff.tsx`, `pilotApi.ts` and their tests remain exactly as previously reviewed
and deployed, flag-gated and dormant.

## Deliberate scope reductions from the mockup

- The mockup's own separate "Pilot" screen (with a checkbox that recorded fake interest locally) was
  dropped from the real implementation entirely — recording anything must go to the server, and 1.1A must
  not present a clickable signup that cannot complete. It was replaced first by a single restrained,
  non-interactive sentence, and later (this addendum) by the real email handoff described above.
- The mockup's simulated ad screen was dropped: ads are a separate campaign asset, not part of the
  customer website.
- Prototype labels and review navigation from the mockup do not appear anywhere in the shipped experience.

## Future deployment note

Deploying this build requires migrating the target database to at least `0007_situation_pilot_interest`
(chained after `0006_situation_screen_names`) and, if the pilot-interest export route will be used,
configuring `SITUATION_PILOT_INTEREST_ADMIN_TOKEN` out of band on the host (never committed to the
repository). Both are additive: neither changes the meaning of any existing table, route or flag, and
deployment itself remains a separate, later gate from this document, following
`docs/execution/UAT_DEPLOYMENT.md` exactly.
