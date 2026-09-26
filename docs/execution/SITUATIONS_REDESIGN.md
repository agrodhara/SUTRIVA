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
