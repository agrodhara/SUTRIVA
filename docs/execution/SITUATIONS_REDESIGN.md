# Phase 1.1A situations redesign

This is the reference for the redesigned Phase 1.1A customer experience: the real, responsive web
implementation that replaced the single, five-step Borrow Better / Money Value journeys with nine narrow,
single-question "situation" checks, plus the optional pilot-interest email handoff (on the arrival screen
and after the result) added afterward. It
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
never carries anything beyond that one categorical key — no financial figure is ever placed in a URL. The
key is validated against both the full set of nine *and* the current route's own group
(`isSituationKeyInGroup`): `/money-value?situation=offer` (a borrow situation) must not open Loan offer
under the Rewards Intelligence header, and the reverse must not happen either — an out-of-group key falls
back to that group's own landing chooser, exactly like an unrecognized key already did.

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

## The pilot-interest email handoff (added 2026-09-26; extended to the arrival screen 2026-09-29)

A consolidated product correction (Copilot review + founder decisions) replaced each situation's original
static, non-interactive "a future pilot may…" sentence with one real, optional handoff:
`apps/pwa/app/situations/PilotInterestForm.tsx`. It was originally rendered only inside `SituationFlow`'s
result step. Since 2026-09-29 the identical component (same endpoint, validation, copy and success/error
handling) is also rendered on the arrival screen, directly below the "Try this check" button, so a visitor
who is already interested can leave an email without having to run the check first. Nothing about the
component itself changed for this — it is the exact same `PilotInterestForm` mounted from a second call
site in `SituationFlow.tsx`, wrapped in the same `styles.pilotPanel` treatment used after the result.

**Copy is fixed and identical across every situation** (heading "Interested in the Sutriva pilot?", body
"We're building a deeper version of this check. Leave your email if you'd like an invitation when it's
ready to test.", field "Email address", button "Register my interest", success "Thanks — we've registered
your interest. We'll email you when the Sutriva pilot is ready."). It collects exactly one field — no name,
phone number or consent checkbox exists on the form — and submitting it is registering interest in an
invitation, not opting into promotional updates; there is no consent column on its table at all.

**Never required, never blocking.** The form now exists in two render branches — the arrival screen (below
"Try this check") and the result screen (below the result) — and "Try this check", "See the result",
"Adjust figures" and exploring another situation all work identically whether or not either copy of the
form was touched. The two mounts are independent instances of the same component; interacting with one has
no effect on the other, and a submission on one screen does not suppress or pre-fill the other.

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

The per-IP key is trusted-proxy-aware (`app/services/client_ip.py`'s `resolve_client_ip`), not a bare
`request.client.host`. Behind the documented nginx reverse proxy, the direct TCP peer is always nginx's
own address, not the visitor's; keying the limiter on that peer alone would put every visitor behind the
proxy in one shared budget, letting one group of visitors exhaust it for everyone else. `resolve_client_ip`
only reads `X-Forwarded-For` when the direct peer is explicitly named in `TRUSTED_PROXY_IPS` (empty by
default — today's exact behaviour until an operator configures it), walking the chain from the right past
any hop that is itself a trusted proxy.

This depends on nginx doing its own part correctly, and getting it wrong is easy to miss without testing
through the real chain: nginx is the *one* hop directly facing the internet here (no CDN or load balancer
in front of it), so its `X-Forwarded-For` directive must **overwrite** any value a client sent with its own
observed `$remote_addr`, never append to it (`$proxy_add_x_forwarded_for` or a bare pass-through of the
client's own header both preserve whatever the client put there). Whether an appended-not-overwritten value
is actually exploitable then depends on an assumption this deployment would otherwise be relying on without
stating it: that a real remote visitor can never themselves connect to nginx from an address named in
`TRUSTED_PROXY_IPS` / `--forwarded-allow-ips` — ordinarily true (a public listener's network stack rejects a
remote packet claiming a loopback or private source address), but not something worth building a rate
limit's correctness on when a strictly simpler, assumption-free directive exists.

An earlier version of this fix used `$proxy_add_x_forwarded_for` (append) instead, on the reasoning that the
API only trusts the right-most, nginx-appended hop. Testing it locally (a real nginx and Uvicorn process
pair, `--forwarded-allow-ips=127.0.0.1` matching the directive) surfaced exactly the gap that reasoning
depends on: run from one machine, the test client's own connection to the local proxy is itself from
`127.0.0.1` — coinciding with the proxy's own trusted identity. A forged `X-Forwarded-For: 8.8.8.8` sent
under those conditions got a fresh `200`/budget with append, and correctly reused the sender's
already-exhausted budget (`429`) with overwrite (see `app/services/client_ip.py`'s
`test_an_appending_edge_proxy_can_be_misled_when_the_caller_shares_its_trusted_address` for the same case as
a unit test). Whether that same coincidence could ever occur for a genuine remote visitor against a
correctly network-isolated production host is exactly the assumption above — overwrite removes the need to
reason about it at all, which is why it is the directive used here, not because append was demonstrated to
be exploitable from the open internet against this specific topology. See
`docs/execution/UAT_DEPLOYMENT.md`'s nginx section for the corrected directive, and
`app/services/client_ip.py` for the algorithm it must agree with.

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

## Proxy-chain deployment smoke test

Run this once, on the actual deployed nginx + Uvicorn + API, after the configuration in
`docs/execution/UAT_DEPLOYMENT.md` (the nginx `X-Forwarded-For` directive, `--forwarded-allow-ips`, and
`TRUSTED_PROXY_IPS` all naming the same trusted address) is in place, and before pilot-interest email
capture is relied on for real visitors. It exercises the deployed proxy chain directly — an automated test
against the bare FastAPI app (see `tests/test_situation_pilot_interest.py`) cannot exercise nginx or
uvicorn's own `ProxyHeadersMiddleware` at all, so this is the one check nothing else in this PR substitutes
for.

**Safety, so nothing here touches a real address or a real visitor's budget:**
- Use a syntactically valid but non-deliverable address for every test submission, tagged so it's
  identifiable afterward: `proxy-smoketest+<unix-timestamp>@example.com`. `example.com` is IANA-reserved for
  documentation and testing and never delivers mail to anyone.
- This uses only access already authorized for the closed canary/UAT (the owner and named testers behind
  Basic Auth) — no new exposure and no additional visitor is affected.
- The rate limiter is process-local, in-memory state (see `app/services/pilot_rate_limit.py`'s
  `FixedWindowRateLimiter` docstring) that clears on its own within the one-hour window with no action
  needed; the test rows this leaves in `situation_pilot_interest` do not, so remove them afterward:
  `DELETE FROM situation_pilot_interest WHERE email LIKE 'proxy-smoketest+%@example.com';` (run directly by
  whoever has database access — there is no delete endpoint, by design, since the export route is
  read-only).
- If the API is ever run as more than one worker process, this in-memory limiter is not shared across them
  and this test's results are not meaningful until it is backed by a shared store (Redis or similar) —
  confirm a single worker before relying on this test.
- Never put the Basic Auth password directly in a shell command — it would land in shell history and in
  process listings (visible to anyone else on the host via `ps`). Load it into a variable first, from
  either a root-only, mode-`0600` credential file or a prompt that does not echo, and reference the
  variable in every curl call below, not the literal value:

  ```bash
  # Either: a protected file (never printed, never logged) —
  BASIC_AUTH_USER=$(cat /etc/sutriva/basic_auth_user)
  BASIC_AUTH_PASSWORD=$(cat /etc/sutriva/basic_auth_password)
  # Or: an interactive prompt (-s suppresses echo; not saved to shell history) —
  read -rp 'Basic Auth username: ' BASIC_AUTH_USER
  read -rsp 'Basic Auth password: ' BASIC_AUTH_PASSWORD; echo
  ```

**1. Repeated requests from one real address reach 429.** From one real client (your own connection to the
canary), submit distinct test emails in a loop:

```bash
for i in $(seq 1 11); do
  curl -s -o /dev/null -w '%{http_code}\n' \
    -X POST "https://<canary-host>/v1/situation-pilot-interest" \
    -H "Origin: https://<canary-host>" -H "Content-Type: application/json" \
    -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASSWORD" \
    -d "{\"situation_key\":\"fee\",\"email\":\"proxy-smoketest+$(date +%s)-$i@example.com\"}"
done
```

Expect ten `200`s (or fewer, matching the configured
`SITUATION_PILOT_INTEREST_SUBMIT_PER_IP_PER_HOUR`) followed by `429` — proving the limit applies at all
through the deployed chain.

**2. A forged `X-Forwarded-For` must not evade it.** Immediately after (1), from the same real connection,
retry with a fabricated header claiming a different address:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -X POST "https://<canary-host>/v1/situation-pilot-interest" \
  -H "Origin: https://<canary-host>" -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 8.8.8.8" \
  -u "$BASIC_AUTH_USER:$BASIC_AUTH_PASSWORD" \
  -d "{\"situation_key\":\"fee\",\"email\":\"proxy-smoketest+$(date +%s)-forged@example.com\"}"
```

Expect `429`, the same as (1) — nginx's `X-Forwarded-For $remote_addr` directive **overwrites** this header
with your real connecting address, discarding the `8.8.8.8` you claimed entirely before the request ever
reaches Uvicorn or the API, so there is nothing left for either of them to be misled by (see
`app/services/client_ip.py` and the corrected nginx directive in `docs/execution/UAT_DEPLOYMENT.md`). If
this instead returns `200` (a fresh budget), the edge is appending to `X-Forwarded-For` instead of
overwriting it — check the live nginx configuration against the documented directive immediately; this is
exactly the misconfiguration this smoke test exists to catch, and it was caught this way once already while
developing this fix (see the paragraph above, in "Protections").

**3. Two genuinely different real addresses get independent budgets.** Unlike (1) and (2), this cannot be
proven by manipulating a header from one connection — that is exactly the thing (2) shows does *not* work.
It needs two real, different network paths reaching the canary: for example, the operator's own connection
and a second named tester's, or the operator's own connection over two different networks (e.g. office
network, then a VPN or mobile hotspot). From each, repeat step (1)'s loop with its own timestamp-tagged
emails; expect each to independently reach ten `200`s before its own `429`, unaffected by the other's usage.

If any of these three does not hold on the deployed host, email capture must not be relied on for real
visitors until it does — the rate limit is either shared (fails (1) or (3)) or spoofable (fails (2)).

**Deployment checklist, in order, before pilot-interest email capture goes live for real visitors:**
1. Confirm the *live* nginx configuration matches this document exactly — in particular, that `/v1/` sets
   `X-Forwarded-For $remote_addr` (overwrite), not `$proxy_add_x_forwarded_for` or a bare pass-through. Read
   the running config back from the host itself (e.g. `nginx -T`); do not assume a prior deploy applied it
   correctly.
2. Apply migration `0007_situation_pilot_interest` (`alembic upgrade head` from `services/api`) and confirm
   `alembic current` shows it.
3. Keep Phase 1.1B off: the committed `shared/track11_config.json` stays `track11bEnabled: false`, and
   nothing in this deployment sets `NEXT_PUBLIC_TRACK_11B_ENABLED=true`.
4. Complete all three smoke-test scenarios above against the deployed host, not a local stand-in.

**Scenario 3 (two genuinely different real addresses get independent budgets) remains unverified as of this
change** — it was not run in the sandbox this work was done in, which has no way to reach the deployed host
from two distinct real network paths. Scenarios 1 and 2 were verified locally against a real nginx +
Uvicorn + API chain built to this exact configuration, not against the deployed host itself. Do not rely on
public email registration until an operator has completed scenario 3 (and re-confirmed 1 and 2) against the
actual deployed nginx and Uvicorn.

## Future deployment note

Deploying this build requires migrating the target database to at least `0007_situation_pilot_interest`
(chained after `0006_situation_screen_names`) and, if the pilot-interest export route will be used,
configuring `SITUATION_PILOT_INTEREST_ADMIN_TOKEN` out of band on the host (never committed to the
repository). Both are additive: neither changes the meaning of any existing table, route or flag, and
deployment itself remains a separate, later gate from this document, following
`docs/execution/UAT_DEPLOYMENT.md` exactly.

## Campaign-window audit and tracking fixes (2026-10-08)

A read-only audit of the paid Instagram campaign actually run **2026-10-01 to 2026-10-03** (not
30 September–1 October as first assumed from a screenshot — verified instead from `campaign_attribution`
timestamps, nginx access logs and the `anonymous_sessions` daily surge, which all agree on the later
window) found two real measurement gaps, both now fixed here, plus a reconciliation step that remains
manual.

**Finding 1 — the group chooser page emitted no event of its own.** Both campaign destination URLs opened
`/money-value` and `/borrow-better` directly, with no `?situation=` parameter, landing on
`SituationLanding`'s choice grid. That screen bootstrapped an anonymous session on mount but reported
nothing else — no view event existed until a visitor actively picked a card. Of 1,488 sessions created
during the campaign window, only ~25 ever produced a single subsequent event. **Fix:** `SituationsApp.tsx`
now reports the chooser's own view with the existing `step_viewed` event type and two new, additive screen
names — `borrow_group_landing` and `rewards_group_landing` (migration `0008_group_landing_screen_name`,
extending the existing bounded allowlist exactly as every prior screen addition has). It fires once per
chooser display (on initial mount if no `?situation=` is present, and again each time "Choose another
situation" returns to it, mirroring how `SituationFlow`'s own `key={active}` remount re-fires its arrival
view on every fresh situation entry) and never fires when a campaign URL carries `?situation=`, since that
visitor's own situation `_arrival` event already covers it. No existing event's meaning changes.

**Finding 2 — `door_selected` (home page journey choice) is lost on a real click.** Previously documented
as a known defect in `docs/execution/UAT_DEPLOYMENT.md` and reproduced fresh during this audit: the home
page's door cards are real `<a href>` links, and the `trackEvent` call in their `onClick` is a fire-and-forget
`fetch` that is not guaranteed to complete before the browser begins unloading the page for the navigation
that same click triggers. **Fix:** a new `trackEventOnNavigate` (`apps/pwa/lib/api.ts`) builds the identical
event body as `trackEvent` — same attribution handling, same shape, same backend route — but delivers it via
`navigator.sendBeacon`, which queues the request with the browser's own network stack synchronously before
the function returns, so it survives the navigation; it falls back to `trackEvent`'s own fetch path only
when `sendBeacon` is unavailable or reports it could not queue the request. `DoorCard.tsx` uses it for
`door_selected` only — no other event's delivery mechanism changed. The home page (`app/page.tsx`) now also
bootstraps the anonymous session on mount (previously only `/borrow-better` and `/money-value` did this),
so a session and its cookie have the best chance of already existing by the time a door card is clicked,
since `sendBeacon` cannot await a 401-triggered bootstrap-and-retry the way the fetch fallback can.

**Verification performed:** the full backend and frontend automated suites (742 backend tests including a
dedicated attribution-capture test for the two new screen names; 156 frontend tests including new coverage
for the chooser-view event, its absence on a `?situation=` bypass, `trackEventOnNavigate`'s beacon and
fallback paths, and the home page's new bootstrap call), plus a full local stack run (this build, this
migration, a real Chromium browser with a genuine captured Instagram in-app-browser user agent) that
confirmed, by querying the database directly afterward: the new `rewards_group_landing` view persisted with
correct attribution for a bare campaign URL; a `?situation=` URL skipped the chooser and persisted only the
situation's own arrival view; and — the direct proof for Finding 2 — a `door_selected` event survived a
real, immediate browser navigation to `/borrow-better` and persisted correctly. **This is a simulation**
(a real browser, a spoofed user-agent string captured from actual campaign traffic, run against a local
stack) **and is explicitly not a substitute for testing on a real phone inside the real Instagram app**,
which has its own WebView cookie, memory and execution behavior this cannot reproduce. That device-level
verification is still outstanding and needs someone with physical device access, ideally against a UAT or
canary deployment of this change before the next campaign goes live.

**Situation-specific campaign URLs for the next campaign.** Both destination URLs audited here pointed at a
bare group page. Pointing a campaign at a specific situation instead skips the chooser entirely — the
visitor lands straight on that situation's own arrival screen, "Try this check" is immediately visible, and
the existing `_arrival` `step_viewed` event (not the new chooser one) is the funnel's first signal, exactly
one screen closer to the ad's own promise. Recommended shape, keeping every other query parameter Meta
already attaches unchanged:

```
https://sutriva.io/money-value?situation=fee&utm_source=ig&utm_medium=paid&utm_campaign=<id>&utm_content=<id>&utm_term=<id>
https://sutriva.io/borrow-better?situation=debt&utm_source=ig&utm_medium=paid&utm_campaign=<id>&utm_content=<id>&utm_term=<id>
```

`situation` must be one of the nine short keys in `situationsConfig.ts` (`debt`, `purchase`, `offer`,
`rejected` for Borrow Better; `fee`, `fit`, `balance`, `multi`, `unused` for Money Value) and must match the
URL's own group — a mismatched pairing falls back to that group's chooser exactly as an unrecognized key
already does (unchanged, existing behaviour). Which situation each ad creative should point at is a product/
marketing decision this document does not make; `fee` and `debt` above are used only as examples, chosen
because they are the two annual-fee/EMI situations closest to what the two audited ad creatives' copy
referenced.

**Reconcile nginx click-ID counts with the Meta export before publishing any acquisition metric.** nginx
access logs for the audited window give an exact, independent count of distinct `fbclid` values on real
landing requests, by campaign:

| Meta `utm_campaign` id | Distinct `fbclid` (nginx) | Total landing requests (nginx) |
|---|---|---|
| `52517814153716` | 2,219 | 3,263 |
| `52518055536916` | 1,469 | 2,097 |

These are **our own server's count of distinct click-throughs that actually reached nginx**, not Meta's own
reported click count, and the two can legitimately differ (ad-network click fraud filtering, pre-fetching,
a click that never reaches our server at all). Before any CTR, CPA or acquisition-cost figure from this
campaign is published, pull the matching per-campaign "Link Clicks" metric from Meta Ads Manager for the
same date range and reconcile it against the table above; a large, unexplained gap in either direction is
itself a finding worth investigating before trusting a derived cost-per-click or cost-per-registration
number. This reconciliation was not completed as part of this change — it requires Meta Ads Manager access
this environment does not have.

## Milestone 1 — campaign journey fix, verification and reconciliation (2026-10-14)

Continuation of the 2026-10-08 work above, on the same branch/PR. This section separates **facts**
(directly measured), **inferences** (a reasonable reading of those facts, stated as such) and **unknowns**
(cannot be established from data this environment has access to) — none of the three is substituted for
another below.

### Migration `0008_group_landing_screen_name` — purpose, compatibility, deployment order, rollback

**Purpose.** Widens exactly one thing: the `ck_product_events_screen_name` CHECK constraint on
`product_events`, adding `borrow_group_landing` and `rewards_group_landing` to the allowlist it already
enforced. No column, table, index or other constraint changes. No existing accepted value's meaning changes.

**What needs this migration, and what does not.** Only the two new screen-name *string values* need it —
that's a database-level allowlist, enforced independently of the application code. Everything else in this
PR needs no migration at all: the `sendBeacon` delivery change, the home-page bootstrap timing change, the
new `step_viewed` event the chooser now emits (it's the existing event type, existing table, existing
columns — only the `screen_name` value is new), and the campaign→session→registration join (proved by the
new backend test using only `situation_pilot_interest.anonymous_session_uuid` and `campaign_attribution.
anonymous_session_uuid`, both already present and already nullable/foreign-keyed since migration `0002`).

**Compatibility and deployment order — verified empirically, not assumed:**
- Old backend code + migration applied: harmless. Old code's `ScreenNameType` Python Literal never contains
  the two new values, so it never sends them; the widened DB constraint has no effect on anything old code
  does.
- **New backend code + migration NOT yet applied: unsafe, and must be avoided.** The new Python
  `ScreenNameType` already accepts the two new values, so Pydantic validation (422) would let a request
  through — but the *database* would still reject the INSERT with the old constraint. Traced through
  `record_product_event`'s exception handling: this does not crash the request: it's caught as a
  `SQLAlchemyError` and returned as `202 accepted_not_persisted` (the same path proved by
  `test_insert_failure_keeps_202_semantics_and_leaks_no_details`) — so the visitor sees nothing wrong, but
  the chooser-view event silently fails to persist, which is exactly the measurement gap this PR exists to
  close. **Required order: apply migration `0008` before or atomically with deploying this PR's code, never
  after.**
- **Rollback — verified empirically on a real local Postgres 16, not assumed from reading the migration
  file:**
  - With **no row yet using the new screen names**, `alembic downgrade -1` then `alembic upgrade head` both
    completed cleanly — confirmed by running it.
  - With **one row already present** using `screen_name = 'rewards_group_landing'`, `alembic downgrade -1`
    **fails outright** with `psycopg.errors.CheckViolation: check constraint "ck_product_events_screen_name"
    ... is violated by some row` — because `op.create_check_constraint` (no `NOT VALID` clause) validates
    the constraint against every existing row when it's added back. This is a loud failure, not silent data
    loss: the downgrade simply does not complete, and the schema stays at `0008`. **Practical rollback plan,
    once any real traffic has used this feature (which it will, immediately on deploy): roll back the
    application code only; leave the migration applied.** This matches the project's own existing rollback
    convention elsewhere in this document ("the database is not downgraded... do not run a downgrade against
    data that matters") rather than introducing a new one.
  - Both of the above (and the additive-upgrade check) are now committed, automated regression tests —
    `tests/test_alembic_group_landing_screen_name.py` — not only this document's narrative; they were run
    directly as part of the verification below.

### Baseline reconciliation, all times UTC (the database's own storage timezone)

**Facts**, from the production database and nginx access logs, both read-only, queried 2026-10-08:

| Metric | Value | Source |
|---|---|---|
| `situation_pilot_interest` rows, all time | 5, all dated 2026-09-27 | DB |
| Rows dated 2026-10-01 to 2026-10-03 | 0 | DB |
| `anonymous_sessions` created 2026-10-01–03 | 1,488 | DB |
| Of those, sessions with ≥1 `product_events` row | 25 | DB |
| `result_declared` events 2026-10-01–03 | 4 | DB |
| nginx landing requests carrying `utm_campaign` in the request path itself (not the Referer header — see the correction below) | 5,360 | nginx |
| Distinct `fbclid` among those landing requests | 3,688 (2,219 + 1,469 per campaign) | nginx |
| `facebookexternalhit` (Meta's own link-preview crawler) hits in the same window | 782 | nginx |

**Correction carried forward from the first pass of this analysis:** an initial grep matched `utm_campaign=`
anywhere in the log line, which also matches it appearing only in the *Referer* header of a same-page
Next.js RSC prefetch request (`GET /borrow-better?_rsc=<hash>`) — not an independent landing. Re-run with
the match restricted to the request line itself; the 5,360/3,688 figures above are the corrected ones. This
is flagged explicitly because it is exactly the kind of "forced match" the no-fabrication rule warns
against — the first pass would have overstated landing volume.

**Inferences:**
- The campaign ran 2026-10-01 to 2026-10-03, not 30 September–1 October as a screenshot suggested —
  inferred from `campaign_attribution` timestamps, the `anonymous_sessions` daily count (27–30/day in the
  week before, 456/731/301 on Oct 1/2/3, back to 3–12/day from Oct 4) and nginx volume all agreeing on the
  same three days, and confirmed separately by the account owner.
- 782 Meta-crawler hits cannot have created a session row: `ensureAnonymousSession()` is a client-side
  `fetch` call that only runs if the page's JavaScript executes, and `facebookexternalhit` does not execute
  JavaScript. Crawler traffic is therefore **not** a plausible contributor to the 1,488 session count,
  though it is counted in raw nginx hit totals.
- The gap between 3,688 distinct clicks and 1,488 sessions, and separately between 1,488 sessions and 25
  with any event, are each more consistent with the specific code-level gaps fixed in this PR (the chooser
  page's silence, discussed below) than with a general "low interest" explanation — but see the explicit
  unknowns immediately after; this is not proof of visitor intent either way.

**Unknowns, stated as such rather than estimated:**
- **Meta's own reported click/reach/CTR figures for these two campaign IDs are not available in this
  environment** (no Meta Ads Manager/Business Manager access). The nginx-derived counts in the table two
  sections up are the only independent count this review can produce. **To close this:** the exact export
  needed is Meta Ads Manager → the ad set(s) under campaign IDs `52517814153716` and `52518055536916` →
  daily breakdown, 2026-10-01 to 2026-10-03 inclusive, account timezone stated explicitly (likely IST; must
  be confirmed, not assumed, since nginx/DB timestamps here are UTC) → metrics: Link Clicks, Unique Link
  Clicks, Impressions, Reach, Amount Spent. Until that export exists, no CTR/CPC/CPA figure for this
  campaign should be published from either source alone.
- **How many of the 1,488 sessions are attributable to the 1,469-of-3,688 clicks that produced more than one
  landing request (a repeat `fbclid`) is not established.** Every sample log line read matches the standard
  nginx combined format plus one trailing field that was consistently `"-"` even on requests that should
  already have carried a session cookie — consistent with (but not a confirmed read of) a log format that
  does not record `$http_cookie`; the live `nginx.conf` `log_format` directive itself was not read this
  round (no host access), so this is stated as an inference, not a verified fact. Either way, nothing
  observed in the logs lets a repeat landing be joined to a specific session row; the two datasets share no
  confirmed common key. This is a genuine data gap, not an oversight to estimate around. **What would close
  it:** confirm the `log_format` directive directly once host access is restored, then either (a) a
  explicitly time-boxed change to the nginx log format to include `$http_cookie` or a hashed session
  identifier for a future campaign only (a logging-configuration change, not something this read-only
  review can make and not something to do retroactively for Oct 1–3, which has already happened), or (b) a
  structural redesign of how repeat landings are correlated — out of scope for this release. For *this*
  campaign, the honest answer is: the contribution of repeat landings to session inflation is unknown and
  will stay unknown.
- Whether a given one of the 25 event-producing sessions represents a distinct person (vs. the same person
  across two sessions, or a non-human but JS-executing agent such as an ad-verification bot) is not
  established and is not treated as established anywhere in this document.

### Attribution capture timing — the first server request vs. client initialisation

Traced through the actual code (`app/services/anonymous_sessions.py`, `app/services/product_events.py`):

- The **first server request** a visit makes is `POST /v1/anonymous-sessions/bootstrap`
  (`ensureAnonymousSession()`). It creates the `anonymous_sessions` row. **It carries no attribution data at
  all** — the endpoint's request model has no UTM/referrer fields, and nothing it does touches
  `journey_runs` or `campaign_attribution`.
- Attribution is captured only inside `record_product_event` (the `/v1/events` handler), and only after it
  has already upserted a `journey_runs` row for that event's `journey_run_id` — `campaign_attribution.
  journey_run_uuid` is nullable in the schema, but the current service function always supplies it, so in
  practice attribution capture is coupled to **a session successfully completing both bootstrap and a
  subsequent event post**, not to session creation alone.
- Before this PR, for a bare campaign-URL landing, the earliest (and often only) subsequent event was
  whatever the visitor's own action produced — frequently nothing, per the 1,488-vs-25 gap. The new chooser
  view (`borrow_group_landing` / `rewards_group_landing`) is now the earliest *automatic* event on that
  screen, firing in the same mount cycle as bootstrap rather than waiting on a visitor's own click — closing
  most of the practical gap without changing the bootstrap contract.
- **Considered and rejected for this release:** moving attribution capture into the bootstrap request itself
  (accepting it as an optional field there, with `journey_run_uuid` passed as `NULL`, which the schema
  already permits). This would shave the remaining few-millisecond gap between the two calls, but bootstrap
  is a foundational, security-reviewed, every-page-touches-it endpoint, and the marginal benefit over "fix
  the chooser's own silence" (which this PR already does) does not justify changing its contract in this
  release. This is flagged as a candidate for a future, separately-scoped change if evidence later shows
  the remaining gap still matters — not something to implement under the "smallest fix" instruction here.

### The `?situation=` parameter: validated, and distinguished from attribution by design

`isSituationKey`/`isSituationKeyInGroup` (`situationsConfig.ts`) check the value against the fixed,
hardcoded, nine-entry `SITUATIONS` object — not a database call, not a regex, a literal `in` check. Any
other value (a nonsense string, a cross-group key, an empty string, a script-injection attempt — all now
covered by an explicit test) falls back to the group chooser exactly as no parameter at all does. There is
no code path by which an unrecognised value does anything other than show the chooser; it is not a trust or
security boundary because it carries no privilege — it only selects which of nine fixed, already-public
screens to show first.

**This is deliberately a different mechanism from attribution.** `situation` answers "which screen does this
visitor land on" and is never used to decide whether a visit is attributable to a campaign. `utm_*`
answers "did an ad or other tracked source bring this visitor here" and is captured and stored entirely
separately, in `campaign_attribution`, regardless of whether `situation` is present. A campaign URL can
carry both, either, or neither, and the two are never cross-validated against each other — an attacker (or
anyone else) crafting a URL with a fabricated `utm_campaign` value gains nothing beyond what any referrer
field already risks (a false attribution row, not a false situation key, and not access to anything).

### Delivery mechanism: `sendBeacon` vs. `fetch(..., { keepalive: true })`

Both exist specifically to survive page unload; both were evaluated.

| | `navigator.sendBeacon` (chosen) | `fetch` with `keepalive: true` |
|---|---|---|
| Queuing | Synchronous — queued with the browser's network stack before the call returns | Also survives unload, but is a `fetch()` call returning a `Promise`; nothing forces it to be awaited before navigation, so correctness still depends on not awaiting it incorrectly |
| Payload limit | 64 KB per call (this payload is well under 1 KB) | ~64 KB *combined* across all in-flight keepalive requests on the page — a shared budget another feature could exhaust |
| Response visibility | None — fire-and-forget by design, cannot detect a 401 or retry | A real `Response` is returned, so a 401-triggered bootstrap-and-retry is theoretically possible, but only if the navigation hasn't already completed by the time it would run |
| Browser support | Supported in every browser this product targets, including the Android WebView Instagram's in-app browser uses | Equivalent support, same caveat |
| Credentials | Same-origin cookies included automatically, as for any same-origin request | Same |

**Chosen: `sendBeacon`**, for the one property that matters most here — it is queued synchronously, so its
delivery does not depend on anything (a microtask, a promise chain, a retry) happening after the function
returns, which is exactly the property a navigation can interrupt. `fetch(keepalive)`'s theoretical
401-retry advantage is not real-world useful here, since the navigation it's racing would already have
started.

**Documented, remaining limitation, not solved by either option:** if no anonymous-session cookie exists
yet at the moment of the click (a true zero-dwell-time click, before the page's own bootstrap call has
completed), the beacon still fires but the server rejects it (`401 missing_session`) with no retry possible
— this is unchanged by this fix and is not solvable without either delaying the click (rejected — harms the
primary journey) or redesigning session issuance (out of scope). The home page now bootstrapping on mount
narrows this window but does not close it. This is the residual delivery limit asked for: **stated, not
hidden.**

**Queueing vs. delivery, verified separately, not conflated.** `sendBeacon`'s return value (`true`/`false`)
only confirms the *browser* accepted the request for transmission — it is not proof the server ever received
it. These were checked as two separate facts, against a real local backend instrumented to log the raw
headers and receive-timestamp of every `/v1/events` hit, with a real Chromium browser performing a real
navigation (not a mock):

- **Queueing**: `navigator.sendBeacon` was wrapped (via `page.addInitScript`, so the wrapper survives the
  very navigation under test) to log its call time and return value to the console the instant it's called —
  confirmed `result: true`, logged synchronously, before the navigation completed.
- **Delivery, including authentication**: the instrumented backend logged, for the `door_selected` request
  specifically: `Origin: http://localhost:3300` (passed `validate_request_origin`, which the
  `/v1/events` route calls explicitly and which rejects anything not in the allowed-origins list — a beacon
  request with no Origin header would have been hard-rejected, so this is a real pass, not an assumption),
  `Content-Type: application/json` (the Blob's declared type is honoured as a real header, not just a label),
  the session cookie present (so `validate_event_session` recognised it and the event was correctly attached
  to the right anonymous session), and HTTP `200` (fully validated and persisted — not merely received).
- **Comparative proof it's the fix, not just a fast network:** the identical test was then run against the
  pre-fix code path (`DoorCard` calling plain `trackEvent`, i.e. an un-awaited `fetch`, with CORS configured
  identically for both builds so that variable couldn't confound the result). Result: **zero `door_selected`
  requests reached the server at all** from the old code, while the same session's *unrelated* next-page
  event (the destination page's own chooser view, a separate `fetch` not raced by this same click) arrived
  normally — isolating the loss specifically to the click-triggered request racing its own navigation, not
  to anything else being slow or broken. This directly reproduces, and directly fixes, the original
  production defect.
- This is local/simulation evidence (real browser, real backend, local network) — not production or
  real-device evidence. See the separation below.

### Attribution capture confirmed on both entry paths

Checked separately, not assumed to generalise from one to the other, using the local full-stack run: two
browser contexts, each with a **different** `utm_campaign` value specifically so the resulting
`campaign_attribution` rows could be tied back to which path produced them.

- **Chooser entry** (bare `/money-value?utm_source=ig&...&utm_campaign=52517814153716`, no `?situation=`):
  the new `rewards_group_landing` view event carried the attribution; the row for campaign `52517814153716`
  is present in `campaign_attribution` afterward.
- **Direct-situation entry** (`/money-value?situation=fee&...&utm_campaign=52518055536916`): the chooser is
  skipped entirely; the existing `rewards_fee_arrival` event is what carries the attribution instead; the
  row for campaign `52518055536916` is present afterward, distinct from the first.

Both paths capture attribution correctly, through two different events (the new chooser view on one path,
the existing arrival event on the other) — confirming the chooser-view fix didn't accidentally become the
*only* place attribution gets captured. **Zero-dwell-time limitation applies identically to both paths and
remains unclosed**: attribution capture still requires the event post (whichever one it is) to complete
before the visitor leaves, and still depends on bootstrap having already completed — see the `sendBeacon`
limitation above, which is not specific to one entry path.

### Backend test flake — precise description, and what could and couldn't be established

**The test**: `test_comfortable_borrowing_audit_redacts_raw_values_for_legacy_and_track11a`
(`tests/test_api.py`). It posts two different borrowing-check requests (the legacy
`/v1/borrow-better/quick-check` route and the newer grouped `/v1/borrowing-intelligence/
comfortable-borrowing-check` route) through a module-level `TestClient`, points `AUDIT_LOG_PATH` at a
per-test `tmp_path` file via `monkeypatch`, and asserts the resulting audit JSONL has exactly two records
with every raw financial value and forbidden field name absent. It has no relationship to anything this PR
touches: not `test_api.py` itself, not the audit-writing code (`app/services/storage.py`), not either
borrowing-check router.

**What was actually observed**, precisely: it failed once, on one full-suite run on this branch, with a
failure this document did not quote verbatim (noted at the time only as "1 failed"). It then passed on three
subsequent full-suite runs on this branch. To check whether the base commit shares this behaviour, the exact
same base commit (`23464ce`, pre-dating this PR) was checked out into its own isolated worktree and venv and
run five times: **729/729 passed every time, no failure.**

**What this does and does not establish.** It does **not** establish "this also fails on the base commit" —
it was never reproduced on the base commit despite five attempts, and it only reproduced once on this
branch out of four attempts. A single non-reproduction after a handful of runs proves neither "flaky on
both" nor "specific to one." This status is carried forward as **unresolved and intermittent**, not as a
disproven or dismissed flake.

**Correction to an earlier overstatement in this document**: an earlier version of this section argued that
zero file-level overlap between this PR's diff and the failing test's own file/code/routes meant "there is
no code path by which this diff could affect that test's outcome." That claim is too strong and is withdrawn
as stated. File separation rules out a *direct* code dependency — it does not rule out *indirect*
interaction through shared test-process state: a module-level `TestClient`/FastAPI `app` instance reused
across the whole file, the audit path's fallback to a shared, non-test-isolated
`/tmp/sutriva/audit_events.jsonl` when some other test in the same process fails to set `AUDIT_LOG_PATH`,
process-level rate-limiter or cache singletons, or simply a changed pytest collection order and count (this
PR adds new test files, which shifts what runs immediately before or after this test in the same process).
Any of those could connect this PR to the failure without touching the same file. **None of these candidate
mechanisms has been tested or ruled out.** The honest position is: root cause undiagnosed, reproduction
inconsistent in both directions, and this PR's connection to it neither established nor excluded.

### Verification this round — separated by evidence type

**Automated, local (this branch, this PR's code):**
- 746/746 backend tests (the one unreproduced exception above; +3 new migration-behaviour tests this round),
  159/159 frontend tests (3 new: unrecognised
  `?situation=` values across five adversarial inputs; `sendBeacon` queuing synchronously, asserted without
  awaiting anything; three rapid repeated `trackEventOnNavigate` calls each queuing independently), clean
  `tsc --noEmit`, clean `eslint --max-warnings=0`, clean production build.
- New backend test (`test_campaign_attribution_joins_through_the_session_to_a_registration`) proves the full
  campaign → session → registration chain against a real local database. No migration needed for this join
  itself.

**Simulation / staging validation of PR #33 (this exact code and migration, run locally — never deployed
anywhere, not production):**
- Full local stack (this build, this migration, a real Chromium browser, a genuine captured Instagram
  in-app-browser user-agent string): chooser view persists with attribution; `?situation=` bypasses the
  chooser; `sendBeacon` survives a real navigation, with the queueing/delivery/authentication distinctions
  above directly verified against real logged headers, not inferred; the pre-fix code path was run through
  the identical harness and lost the event entirely, isolating the fix's effect.
- Not re-run this round (per "do not repeat completed diagnostics without reason"): the original Oct-08
  proof that these three things work at all — it stands; this round added the specific gaps (edge-case
  input, synchronous-queueing proof, rapid-repeat delivery, delivery vs. queueing, the base-commit flake
  check, the full campaign→registration join) the first pass didn't cover.

**Current production (`sutriva-alpha`, live, still running `23464ce` — this PR is not deployed there):**
- Confirmed via `git log` against `origin/main` that it has not moved since the last direct check.
- **Not freshly checked this round**: live registration count, `/ready`, nginx state. SSH access is
  currently blocked — the host's `/32` allowlist does not include this session's current egress IP
  (`110.226.183.130`; it changed from the 2026-10-08 session's `124.122.198.227` before that, and from a
  third value before that — this is the access control working as designed each time, not an incident).
  Restoring it is the operator's decision.

**Real device:** none performed. Not approximated as simulation anywhere above.

### Current-production phone diagnostic — baseline/routing validation ONLY

**This tests what is live today (`23464ce`), not this PR.** `sutriva.io` does not yet have migration
`0008` or any of this PR's code — a device test against it today cannot and does not validate the
chooser-view event, the `sendBeacon` fix, or anything else in this PR. Its only legitimate purpose is
a **baseline**: confirming routing (chooser vs. direct-situation), page load, and ordinary journey
completion behave as expected on the currently-deployed code, so there's a known-good reference point
to compare against *after* a real deployment. A separate, genuinely PR-validating device test is
listed below, for after deployment is authorized.

**Diagnostic URLs use clearly test-marked UTM values, not the real historical campaign IDs** — reusing
the actual Meta campaign IDs (`52517814153716`/`52518055536916`) in a manual diagnostic would mix
untraceable manual-test rows into what should stay a clean record of real ad-driven traffic, and would
be indistinguishable from real campaign data in any later Meta-export reconciliation.

```
Chooser routing, money-value: https://sutriva.io/money-value?utm_source=diagnostic&utm_medium=manual_test&utm_campaign=sutriva_diag_2026_10_14
Chooser routing, borrow-better: https://sutriva.io/borrow-better?utm_source=diagnostic&utm_medium=manual_test&utm_campaign=sutriva_diag_2026_10_14
Direct-situation routing (bypasses the chooser on current production too — this routing is not new): https://sutriva.io/money-value?situation=fee&utm_source=diagnostic&utm_medium=manual_test&utm_campaign=sutriva_diag_2026_10_14
```

**Script, inside Instagram's own in-app browser (tap the link from a DM or post, do not open in
Chrome/Safari):**
1. Note the wall-clock time and your phone's OS version before tapping.
2. Tap the link. Observe: does the page load, how long does it take, is there any visible error.
3. If it opens on the chooser (first two URLs): pick any situation card. Note which one and the time.
4. If it opens directly on a situation (third URL): confirm the arrival screen and "Try this check →"
   render (today's code only shows the situation's own arrival here — it will not show the new
   chooser-view instrumentation, since that doesn't exist on production yet).
5. Tap "Try this check →", then "See the result →". Confirm a result renders.
6. Separately, from `https://sutriva.io/`, tap one of the two door cards and confirm it navigates —
   **this exercises production's current (pre-fix) delivery, which this audit already showed loses the
   event; a successful navigation here says nothing about whether the click was tracked.** Do not submit
   the email form during this diagnostic.
7. Report back: device model and OS, exact tap timestamps for steps 2–6, anything that looked wrong.

**Matching this to backend data** uses timestamps (±1 minute) and, if device access allows reading it,
the `sutriva_anon_session` cookie value — not a name, email or phone number. **Test one available phone
first; record the second OS as pending if unavailable.** Not performed this round — needs physical
device access this environment does not have.

### Production smoke test for the new tracking and attribution — prepared now, run only after deployment is separately authorized

Not executed. Written now so it's ready the moment deployment is approved, using the same
clearly-test-marked UTM convention as above (never the real campaign IDs):

```
Chooser view (new instrumentation): https://sutriva.io/money-value?utm_source=diagnostic&utm_medium=manual_test&utm_campaign=sutriva_smoke_<deploy-date>
Situation-specific bypass: https://sutriva.io/money-value?situation=fee&utm_source=diagnostic&utm_medium=manual_test&utm_campaign=sutriva_smoke_<deploy-date>
```

1. Confirm `/ready` reports `migration: current` at `0008_group_landing_screen_name` — not just that the
   app responds.
2. Load the first URL; confirm (via the protected admin surface or a direct, read-only DB check — not by
   trusting the page alone) that a `step_viewed`/`rewards_group_landing` row was persisted with
   `utm_campaign = sutriva_smoke_<deploy-date>` in `campaign_attribution`.
3. Load the second URL; confirm it skips the chooser and persists `rewards_fee_arrival` instead, with the
   same UTM value, distinguishing it from the first row.
4. From `https://sutriva.io/`, tap a door card; confirm `door_selected` is persisted (this is the actual
   proof the `sendBeacon` fix works in production — device simulation and local proof are not a
   substitute for this one).
5. Delete the smoke-test rows afterward (same pattern as every prior deployment's test-data cleanup),
   tagged clearly enough to find by the `sutriva_smoke_` prefix.

### Gate A — requirements before relaunching this campaign

1. SSH/production access restored and a fresh check confirms no regression, using **host/release
   evidence** — `readlink /opt/sutriva/current` (or equivalent) plus service status on the host itself,
   and `/ready` — not git history alone. `git log` against `origin/main` only proves what commit *could*
   be deployed; it is not evidence of what is actually running, which can only come from the host.
2. Meta Ads Manager export obtained and reconciled against the nginx table above (see "Unknowns").
3. This PR reviewed, merged and deployed (migration `0008` applied) — not done as part of this task.
4. The current-production baseline/routing diagnostic above completed (confirms today's routing and
   journey behavior as a reference point — it does not and cannot validate this PR), **and** the separate
   post-deployment smoke test completed once deployed, with evidence for both.
5. Situation-specific campaign URLs (not bare group URLs) agreed with whoever manages the Meta campaign,
   using the verified shape above.
6. **Historical comparability note, stated explicitly so it isn't lost:** "sessions with events" before this
   PR (25 of 1,488 in the Oct 1–3 window) and after it are **not the same measurement**. Before, an event
   required a visitor's own action beyond landing; after, the chooser screen itself contributes one
   automatically. A future campaign's "sessions with events" rate will look better than Oct 1–3's even with
   identical visitor behaviour, purely from this instrumentation change — it must not be read as a behaviour
   or creative improvement without separating the two effects (e.g. by also reporting "sessions that reached
   a situation's own arrival", which is unaffected by this change and is the fair comparison point).
