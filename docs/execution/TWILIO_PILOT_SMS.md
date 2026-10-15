# Twilio SMS adapter for the Phase 1.1B pilot

This adapter uses Twilio **Programmable Messaging**, not Twilio Verify. Sutriva's
existing OTP service generates and validates the code, enforces attempts and send
limits, and records consent and anonymous-session linkage. A successful Twilio
Messages API response means that Twilio **accepted** a message for processing;
it does not prove delivery to the recipient's handset.

## Configuration (server-side only)

Set these only in the API service's secret environment (e.g. `/etc/sutriva/api.env`,
matching every other secret this project already keeps host-only — never in the PWA
bundle, never in Git, never in chat, never in a log line):

| Variable | Purpose | Local/review environment | `sutriva-alpha` (production host) |
|---|---|---|---|
| `PILOT_SMS_PROVIDER` | Must equal `twilio` to select this adapter at all | **Missing** (confirmed by inspecting this environment directly) | **Not checked** |
| `TWILIO_ACCOUNT_SID` | Owning Twilio account SID | **Missing** | **Not checked** |
| `TWILIO_API_KEY_SID` | A server-side API Key's SID (see Authentication below) | **Missing** | **Not checked** |
| `TWILIO_API_KEY_SECRET` | That API Key's secret | **Missing** | **Not checked** |
| `TWILIO_MESSAGING_SERVICE_SID` | The Messaging Service to send through | **Missing** | **Not checked** |
| `PILOT_OTP_HMAC_KEYS` | Signs/verifies OTP codes at rest — **required independently of Twilio**; without it the service fails closed regardless of SMS provider | **Missing** | **Not checked** |

An empty configuration template listing these same names (no values) has been added to the repo's
existing root `.env.example` (matching this project's one-file convention — a separate
`services/api/.env.twilio.example` was tried first and dropped: it isn't covered by the `.gitignore`'s
`!.env.example` exception and so would never actually be committed, and it would have duplicated an
existing pattern rather than extended it). Whoever holds the Twilio account copies those names into the
real secret environment and fills them in privately on the host — never in this repository, never in
chat.

No value is printed anywhere in this document or was requested in chat. "**Not checked**" for
`sutriva-alpha` is precise, not a rounding of "probably missing": SSH access to that host is
currently blocked (unrelated allowlist issue, documented in `SITUATIONS_REDESIGN.md`'s PR #33
section), and — distinct from that — **this review has no record of ever having specifically
queried these six variables on that host**, even during earlier sessions when SSH access was
available. Do not infer either "present" or "missing" there from anything in this document.

Optional, all with safe defaults (`app/pilot_config.py`), only worth setting deliberately:
`PILOT_OTP_CODE_LENGTH`, `PILOT_OTP_TTL_SECONDS`, `PILOT_OTP_RESEND_COOLDOWN_SECONDS`,
`PILOT_OTP_MAX_ATTEMPTS`, `PILOT_OTP_MAX_SENDS_PER_REGISTRATION`, `PILOT_OTP_MAX_SENDS_PER_PHONE`,
`PILOT_OTP_PHONE_SEND_WINDOW_HOURS`, and the per-IP ceilings
`PILOT_RATE_LIMIT_INTEREST_PER_IP_PER_HOUR` / `_MOBILE_PER_IP_PER_HOUR` / `_VERIFY_PER_IP_PER_HOUR`.

With any required Twilio setting absent, the API fails closed with `sms_provider_not_configured`
(`app/services/sms.py::get_sms_sender`) — never a fabricated success. The committed
`track11aEnabled` and `track11bEnabled` flags remain `false`; nothing in this document enables 1.1B.

## Authentication method (inspected, not assumed)

`TwilioSmsSender` (`app/services/sms.py`) authenticates with HTTP Basic Auth using a **Twilio API
Key** (`TWILIO_API_KEY_SID`/`TWILIO_API_KEY_SECRET`) against the Messages API, scoped under
`TWILIO_ACCOUNT_SID` — **not** the account's primary Auth Token. This is the credential type Twilio
itself recommends over the Auth Token for server-side integrations (an API Key can be individually
revoked and is not the one secret that also controls the whole account), and it's already the
correct choice here; no change needed. The message body itself
(`"Your Sutriva verification code is {code}. It expires in {ttl} minutes. Do not share it."`) is
sent as a form field, not a URL parameter, and the code is never logged — confirmed by reading
every log line in the send path, including the failure branches.

## Private credential setup (for whoever holds the Twilio account — not for this session)

**Using the existing account, not creating a new one** — see "Existing Twilio correspondence/account"
below for why. These steps create a dedicated API Key and Messaging Service under that account for
this specific use case, not a new account.

1. In the Twilio Console, under the **existing** account: **Account → API keys & tokens →
   Create API key** (Standard type) — a fresh key dedicated to this integration, separate from
   whatever the already-rotated credentials were for. This produces the SID and secret pair — **the
   secret is shown once**; store it immediately in the host's secret manager or `/etc/sutriva/api.env`
   (mode `0600`), never in a message to me, a commit, or a shell history.
2. Create a **Messaging Service** (Messaging → Services → Create). Note its SID
   (`MGxxxxxxxx...`) — this is `TWILIO_MESSAGING_SERVICE_SID`.
3. Set a **spending/usage trigger** in the Twilio Console (Usage → Triggers) at a small ceiling
   (e.g. a few hundred rupees) that alerts or (preferably) disables further sends — this is a
   Twilio-side control independent of this codebase's own per-IP/per-phone caps, and worth having
   as a second layer.
4. Place the four values in the API service's existing secret-environment mechanism, matching how
   `SITUATION_PILOT_INTEREST_ADMIN_TOKEN` is already handled on `sutriva-alpha` — never pasted to me,
   never committed.
5. Tell me only: that it's done, and the **designated test phone number** (a number you own and can
   personally receive the test code on) — not the credential values themselves.

## India delivery requirements — two separate questions, corrected this round

An earlier version of this section treated DLT provisioning (~10 business days) as a universal
prerequisite for any India delivery at all. **That was wrong, and is corrected here**: Twilio
distinguishes a **route** question (international vs. domestic — resolved below, not a blocker) from
a **use-case/content approval** question (not resolved, and not route-dependent). Conflating them
overstated the blocker. Sourced directly from Twilio's own published pages, not inferred.

### Route: the account defaults to international, automatically, no DLT required

Per Twilio's own legal terms
([twilio.com/en-us/legal/service-country-specific-terms/outbound-sms](https://www.twilio.com/en-us/legal/service-country-specific-terms/outbound-sms)),
verbatim on how routing is assigned: *"If Customer is approved for a domestic route for outbound
SMS, Twilio will automatically send such outbound SMS using a domestic route."* Domestic approval
requires three things, none of which Sutriva has done: provider approval of a domestic Sender ID
(this is the DLT-gated step), written notice of that approval to Twilio, and Twilio configuring it.
**Until and unless those three happen, the account is not "blocked" — it is on the international
route by default, automatically, today, with no DLT prerequisite.** The India guidelines page
([twilio.com/en-us/guidelines/in/sms](https://www.twilio.com/en-us/guidelines/in/sms)) describes
what that route looks like in practice: messages transmit via mobile operators' International Long
Distance Operator (ILDO) connections, using a random ILDO-approved short code (any alphanumeric
sender name is overwritten with that random number) — meaning the controlled test this task
authorizes **can proceed on route grounds alone**, without waiting on DLT. What DLT/domestic
registration actually buys, if pursued later, is a stable, recognizable sender ID and the
reliability profile carriers give registered domestic traffic — a quality/branding upgrade for
sustained use, not a connectivity prerequisite for one test. **Twilio's own documentation does not
fully specify the inverse case** (an account that previously had domestic approval sending
international traffic, or edge-case automatic migration back to international) — stated as a gap in
their public docs, not resolved by reading further.

### Use-case/content approval — still open, not resolved by the route being fine

Twilio's India guidelines page states, verbatim: *"Sending firearms, gambling, adult content,
**money/loan**, political, religious, controlled substance, cannabis, and alcohol related content is
strictly prohibited."* Separately, Twilio's enforcement model has two distinct mechanisms (per their
Acceptable Use Policy and campaign-vetting error documentation): **account-level suspension** for an
Acceptable-Use-Policy violation (not specific to a route — this is the one that matters here), and
**template/campaign rejection** (specific to domestic registration vetting, not the international
route Sutriva's account currently uses). **This means the content restriction is not avoided by
using the international route** — it's a separate, account-wide compliance question. Fact: the
restriction is published and names Sutriva's category. Inference, not confirmed: it most plausibly
targets promotional/solicitation content rather than a neutral, user-requested OTP (banks and
lenders routinely send Twilio OTPs in India; Sutriva's message body carries no loan terms, amounts,
or promotional language). Unknown, and the actual risk this task's item 2 asks to close: whether
Twilio's account-level compliance review would still flag the account's *declared use case*
(financial-wellness comparison tool) regardless of that neutral wording. **Not resolved by my
reading — resolved only by Twilio's own written answer.** See the prepared (not sent) request below.

## Abuse/cost controls — assessed

**Already present and sound**, confirmed by reading the code (`app/services/pilot.py`,
`app/pilot_config.py`):
- Per-registration send cap (default 5) and a separate per-phone-number cap across *every*
  registration that has ever named it, in a rolling window (default 8 per 24h) — the second closes
  the obvious bypass of re-registering with the same number to reset the first.
- A resend cooldown (default 30s) and a hard verify-attempt ceiling (default 5) that locks the
  challenge once exceeded.
- Codes are HMAC-SHA256'd with a key held only in configuration, not a bare hash — not reversible
  from a stolen database row alone.
- A failed or rejected provider send rolls back the whole transaction (`send_or_raise` /
  `SmsSendRejectedError`): no "sent" row, no consumed quota, for a message that didn't go out.
- An advisory lock on the phone number during the quota check closes a race where two concurrent
  requests for the same number could both read a not-yet-exhausted count.
- Per-IP rate limits on every pilot route, independent of the above.

**Gap found and fixed this round**: `app/routers/pilot.py`'s rate-limit key used the raw TCP peer
(`request.client.host`) directly — the **identical gap** already found and fixed for
`app/routers/situation_pilot_interest.py` in PR #29. Behind the documented nginx reverse proxy, that
peer is always nginx's own loopback address for every visitor, collapsing every real visitor's
OTP-send budget into one shared, sitewide bucket instead of one per visitor — a fairness/availability
bug (one busy or malicious visitor can exhaust the OTP feature for everyone else), not a
spoofing vector, since this route never read `X-Forwarded-For` at all before this fix, trusted or
not. **Fixed**: now uses the same `resolve_client_ip` (trusted-proxy-aware) resolution already
reviewed and deployed for the 1.1A route. Locked in with three new tests mirroring that route's own
trusted-proxy test suite exactly — and verified precisely, not just "all pass", by temporarily
reverting only the one-line fix and re-running the three: the two describing fail-safe behavior that
both the old and new code share by construction (no trusted proxy configured → one shared bucket,
same either way; an untrusted peer forging the header → still one shared bucket, same either way)
**passed on the unfixed code too**, as they should — they're not supposed to distinguish the two.
The one test that actually exercises the fix
(`test_with_trusted_proxy_configured_each_real_visitor_gets_an_independent_otp_budget` — a real
trusted proxy *is* configured, so old and new code should disagree) **failed on the unfixed code and
passes only with the fix applied** — confirmed by running it both ways, not inferred from the other
two. This is a code-level fix to currently-inert (flag-disabled) code; it does not enable, deploy, or
expose anything, and `1.1B` stays `false`/`404` exactly as before.

**Residual, not solved by any per-IP scheme**: an attacker distributing requests across many source
IPs is bounded only by the per-registration and per-phone caps (which hold regardless of source IP),
not by the per-IP ceiling. This is the same residual every per-IP control in this codebase has and is
not a new or 1.1B-specific gap.

**Mapped explicitly to the three things this review was asked to verify** (re-run fresh this round,
732/732, on this branch's own base commit, `23464ce`):
- **Trusted-proxy handling**: `test_with_trusted_proxy_configured_each_real_visitor_gets_an_
  independent_otp_budget` — with `TRUSTED_PROXY_IPS` naming the proxy's real peer address,
  `X-Forwarded-For` is correctly read and two different real visitors behind it get two independent
  budgets. The test that actually proves this discriminates old from new code (see above).
- **Independent legitimate-client limits**: the same test's second half — the *first* visitor's own
  budget is still correctly exhausted on a repeat attempt, so "independent" means genuinely per-visitor,
  not "unlimited."
- **Resistance to forged forwarding headers**: `test_bypassing_the_trusted_proxy_cannot_evade_the_
  otp_limit_via_the_header` — a caller connecting directly (not from the configured trusted proxy) that
  sets its own `X-Forwarded-For` to two different fabricated values still shares one bucket; the header
  is only ever honoured once the connection itself originates from a named trusted address, so a remote
  caller can never grant itself a fresh identity by setting it.

**Public OTP confirmed disabled**: `shared/track11_config.json`'s committed `track11bEnabled` is
`false` (untouched by this diff — not a file this PR changes at all), and `_require_track11b()`
returns `404` for every `/v1/pilot/*` route while it is. Re-confirmed by re-reading the committed file
this round, not assumed from memory.

## Failure paths — tested

Existing suite already covers: wrong/missing Origin (403 on every route, not just verify), flag-off
404 on every route, resend-too-soon (429), resend/mobile per-IP and per-registration/per-phone
exhaustion (429, distinct codes), expired code (410), wrong code with attempt counting (401, then 429
once attempts exhaust), already-verified re-submission (409), and a provider that rejects or raises
(503, `sms_send_failed`/`sms_provider_not_configured`/`otp_signing_key_not_configured`, never a false
`otp_sent`). All exercised through the `logging-dev-only` sender (no real network call) — this proves
the *application's* failure handling, not Twilio's actual behavior under a real rejection (e.g. an
invalid number, a carrier block) in isolation. Confirmed by running the full suite on this branch
and, separately, on the base commit before this fix — see below.

## Failure-path coverage, mapped item-by-item against the explicit test list

Checked the existing suite (`tests/test_pilot_registration.py`, re-run this round) against each item
named, rather than assuming the general "Failure paths — tested" section above already covers all of
them precisely:

| Required case | Covered? | Evidence |
|---|---|---|
| Wrong code | Yes | `test_wrong_code_is_rejected_and_counted_as_an_attempt` |
| Expired code | Yes | `test_expired_code_is_rejected_even_if_correct` |
| Reused code (already-verified) | Yes | `test_verifying_an_already_verified_registration_is_rejected` — the only "reuse" a verified code could attempt is re-submitting after success, which is rejected (409) |
| Resend cooldown | Yes | `test_resend_too_soon_is_rejected_and_a_later_resend_works_with_a_fresh_code` |
| Attempt limits | Yes | `test_too_many_wrong_attempts_locks_the_code_out`, and `test_a_resend_does_not_reset_the_attempt_count_so_it_cannot_grant_unlimited_fresh_guesses` (closes the obvious bypass of resending to reset attempts) |
| Invalid/unsupported numbers | Yes | `test_mobile_submit_rejects_a_non_e164_phone_number` — format-level only; no test exists for a syntactically valid E.164 number from an unsupported country/carrier, since that is a Twilio-side rejection, not an application-level branch (see gap below) |
| Provider timeout/error | Yes | `tests/test_twilio_sms.py::test_twilio_timeout_fails_closed_without_logging_code` — a transport that raises `httpx.ReadTimeout` results in `SmsSendRejectedError`, not a false success, and the code is confirmed absent from logs. (Initially logged here as a gap in this round's first pass — that was wrong; corrected after actually reading `tests/test_twilio_sms.py`, which this session had not yet opened before making the claim. No new test needed.) |
| Bypass prevention | Yes (composite) | Covered across several tests rather than one: `test_per_registration_send_cap_cannot_be_bypassed_by_changing_the_number_repeatedly`, `test_per_phone_send_cap_cannot_be_bypassed_by_starting_a_new_registration`, `test_per_phone_quota_is_not_erased_when_a_registration_changes_its_number`, `test_bypassing_the_trusted_proxy_cannot_evade_the_otp_limit_via_the_header`, `test_concurrent_sends_to_the_same_phone_cannot_both_pass_a_nearly_exhausted_quota` |

**No genuine test-coverage gap found** against this explicit list, once `tests/test_twilio_sms.py` is
included alongside `tests/test_pilot_registration.py` — every named case has a passing, discriminating
test. (`tests/test_twilio_sms.py` additionally covers unsupported/malformed provider responses — a
non-201 status, a `failed`/`undelivered` status, and a response missing a valid message `sid` — all
correctly treated as rejections, not successes.)

## Secure local code entry (for the one controlled real-send test, once unblocked)

The task asks for "secure local code entry" to verify a real OTP once received. Proposed mechanism,
not yet usable (blocked on the same three items as the real send itself):

- The designated recipient reads the code **off their own phone** and types it directly into the
  existing `/v1/pilot/verify` flow (the same form real visitors would use) — there is no separate
  "admin" code-entry path to build or maintain, and none should be, since adding one would be a new,
  unaudited bypass of the normal verification route.
- This session (or any operator) **never reads, requests, or logs the code value** at any point — not
  from the recipient, not from Twilio's API response (which never contains the code — only delivery
  status), not from any application log (confirmed above the code is never logged).
- The only values this session will report after the real-send test are pass/fail outcomes (did the
  known-correct code verify; was a known-wrong code rejected) — never the code itself, matching the
  existing "credentials as present/missing, not values" discipline applied throughout this document.

## Existing Twilio correspondence/account — checked before drafting anything new

Searched this repository for any record of prior Twilio correspondence (support tickets, case numbers,
email threads) before drafting a new request. **Found: none** — no ticket number, no quoted reply, no
reference to any prior exchange with Twilio support or compliance about this or any use case.

**Found instead, and more significant: a Twilio account already exists.** `docs/decision_log.md`'s
2026-09-25 entry records that, during an unrelated credential-exposure incident, "*unrelated Twilio
credentials that happened to be stored in the same file were rotated separately by the account owner
directly in the Twilio Console*" — meaning the account owner already holds and actively manages a real
Twilio account, independent of this engagement's own work. This changes what "credential setup" means
here: **not** creating a new account from zero, but creating (or confirming) a dedicated API Key and
Messaging Service *under that existing account*, scoped to this specific OTP use case, rather than
reusing whatever those rotated credentials were originally issued for (which this document has no
visibility into and does not assume). The setup steps below are written for that case. Whether the
account owner has separately been in touch with Twilio about anything relevant to this use case is not
visible from this repository and was not assumed either way.

## Twilio's actual reply — searched again this round, still not found anywhere I have access to

This round's instruction asked to "inspect the actual existing reply" and "identify only precise
unanswered requirements" — implying a reply may exist. **Searched exhaustively and found none**, so this
is reported honestly rather than fabricated or assumed: re-checked `docs/decision_log.md` in full (no new
entries beyond the existing-account finding above), searched every PR's description and comments on
GitHub for PRs #33, #34, and #35 (`gh pr view --json comments` — all empty), ran `gh search prs`/
`gh search issues` across this repository for "twilio" (only this engagement's own PR descriptions
matched, not a Twilio-authored reply), fetched all remote branches and searched their content, and looked
for any file resembling correspondence (`*reply*`, `*.eml`, `*.txt` naming) — none found.

**This document cannot "identify only precise unanswered requirements" from a reply that isn't visible
to this session.** If a reply exists, it is either outside this repository (an inbox, a support portal, a
conversation held directly by the account owner) or not yet shared with this session — either way, the
exact next input needed is: paste the reply's content, or its location, so it can be checked against the
one open question this document has repeatedly named (the money/loan content-restriction wording, see
above) rather than re-stating that question as still fully open by default.

## Prepared, not sent: written-confirmation request to Twilio

Drafted below so it's ready the moment you instruct me to send it (or you send it yourself, or route
it through your own Twilio account contact) — **not sent as part of this task**, per explicit
instruction. If correspondence with Twilio already exists outside this repository that answers this
question, that supersedes sending this.

> Subject: Use-case confirmation — OTP-only transactional SMS for a financial-wellness comparison tool (India)
>
> We operate Sutriva, an anonymous-first financial-wellness web tool (loan-offer comparison and
> card-fee review). We plan to use Twilio Programmable Messaging to send a single type of message to
> India: a user-requested, one-time authentication code, sent only after a visitor explicitly submits
> their own mobile number to verify it. Each message reads exactly: "Your Sutriva verification code is
> {code}. It expires in {N} minutes. Do not share it." No promotional, loan-offer, rate, or marketing
> content is ever included in any message from this account; no message is sent unsolicited. Given your
> published India guidelines list money/loan-related content as prohibited, we'd like written
> confirmation that a user-requested authentication OTP for a disclosed financial-wellness use case
> (not a loan offer, not promotional) is permitted on this account, and whether any additional account
> registration or category declaration is required on our side before sending. Account: [SID once an
> account exists]. Intended route: international (no domestic/DLT registration in place).

## Verify vs. Programmable Messaging — does the India requirement differ by product?

Checked directly, per instruction not to assume one product's requirements carry over to another.
Twilio's **Verify** product (a separate, managed OTP API — not what this codebase uses) and
**Programmable Messaging** (what `TwilioSmsSender` actually uses) are different APIs with different
billing and a different delivery abstraction, so the question is real, not rhetorical.

**Finding, with its limits stated plainly**: every India-specific source found — Twilio's
country-specific legal terms page and the India SMS guidelines page cited above — frames DLT/route
approval as a property of **the Twilio account and the phone number/sender ID sending the traffic**,
not of which Twilio API product originated the send. Verify sends its messages through the same
underlying India carrier connections (domestic vs. international route) as Programmable Messaging;
Twilio's own Verify pricing/country-support pages list India with the same route-dependent delivery
caveats, not a separate exemption. **I did not find a single Twilio-authored page that states this
equivalence explicitly for Verify** (several searches returned only general Verify documentation, not
an India-specific carve-out or confirmation either way) — so this is a **reasoned conclusion from how
Twilio's routing model is documented to work, not a directly confirmed fact**. It does not change
anything operationally here, since **this codebase does not use Verify** and has no plan to adopt it;
it is recorded only because the task explicitly asked the question. If a future decision to switch to
Verify is ever considered, this equivalence should be re-confirmed with Twilio directly rather than
relied on from this note.

## Cost monitoring — what exists today vs. what a real hard cap requires

Distinguishing, per instruction, an alert from a cap:

**What a Twilio Usage Trigger actually does (existing control, once configured — not yet configured
here)**: it watches a usage/spend metric and fires a **webhook call and/or email** when a threshold is
crossed. That is the entire native behavior. **It does not, by itself, stop further sends.** A Usage
Trigger is a notification mechanism, not an enforcement mechanism — calling it a "hard cap" would
overstate what it does. This document's own setup steps above said a trigger can "alert or (preferably)
disable further sends" — the "disable" half is **not automatic**; it requires one of the two concrete
mechanisms below to actually be built, which has not been done:

- **Build it**: a webhook receiver that, on receiving the trigger's callback, calls Twilio's own API to
  suspend the specific **subaccount** this integration sends from (requires isolating this feature's
  sends under a dedicated Twilio subaccount first, specifically so suspending it cannot affect
  anything else on the parent account). This is a real hard stop, but it is **proposed, not built** —
  no such webhook receiver exists in this codebase today.
- **Configure it**: fund a dedicated subaccount with a small, fixed prepaid balance and leave
  auto-recharge **off**. Once the balance is exhausted, sends fail at Twilio's end with no code to
  write. This is the simpler of the two and needs no new service, only Twilio Console configuration —
  also **proposed, not yet done**, since no dedicated subaccount or credentials exist yet.

**Existing control, already real and already covered above**: this codebase's own per-registration,
per-phone-number, and per-IP send caps (`app/pilot_config.py`, enforced in `app/services/pilot.py`)
bound *this application's* ability to trigger sends, independent of anything Twilio does — these are
genuine hard limits already in the code, not alerts, and they remain the primary control regardless of
which Twilio-side option is configured later.

**Conclusion**: as configured today, **no hard spend cap exists on the Twilio side** — only the
proposed options above would create one. The application-side caps are real and already enforced, but
they limit *attempts*, not *Twilio account spend* directly (a visitor could still be sent the maximum
allowed number of messages within the app's own limits; the Twilio-side cap is a second, independent
layer against a different failure mode — e.g. a bug or a credential leak causing far more sends than
the app's logic intends).

## Destination restrictions — Messaging Service Geo Permissions (proposed, not configured)

Twilio Messaging Services support **Geo Permissions**, a per-Messaging-Service setting that restricts
which destination countries/regions it will send to at all, independent of this codebase's own logic.
**Not configured today** — no Messaging Service exists yet. Proposed: once created, restrict Geo
Permissions to India only (the only destination this pilot is designed for). This is a Twilio-side
allowlist, not a replacement for this codebase's own E.164 validation
(`ck_pilot_registrations_phone_e164`, already enforced at the database level) — the two are
complementary: the database constraint rejects malformed input before it ever reaches Twilio; Geo
Permissions would reject a well-formed but out-of-scope destination (e.g. a validly-formatted non-India
number) at the Twilio layer even if application logic had a bug that let one through.

## Phone number storage, access, encryption, retention, and deletion — checked, not assumed

Read directly from `alembic/versions/0004_pilot_registration.py` and
`app/repositories/pilot.py`, reporting exactly what exists and naming what does not, per instruction
not to claim an absent control:

- **Storage**: `pilot_registrations.phone_number` is `sa.Text()` — **plain text, no application-level
  encryption or hashing**. A CHECK constraint (`ck_pilot_registrations_phone_e164`) validates E.164
  format but provides no confidentiality. A partial index
  (`idx_pilot_registrations_phone_number`, `WHERE phone_number IS NOT NULL`) makes it efficiently
  queryable in plain text.
- **Access**: no access path exists beyond direct database query today. Unlike
  `situation_pilot_interest`, which has an admin-token-gated export route
  (`GET /v1/situation-pilot-interest/admin/export`), **`app/routers/pilot.py` has no admin or export
  route at all** for registrations, phone numbers, or OTP records — there is no formal, audited
  retrieval path, only whoever has database credentials.
- **Encryption at rest**: none at the application/column level (confirmed above). Disk/volume-level
  encryption, if any, would be a Postgres-host/infrastructure property, not something this codebase
  configures or can attest to from here.
- **Retention**: **no retention or purge job exists** for `pilot_registrations`, `otp_challenges`, or
  `otp_sends` — confirmed by grep across the migrations and service code. This is unlike
  `anonymous_sessions`/`product_events`, which do have a documented purge pattern elsewhere in this
  codebase. A phone number submitted today would persist indefinitely with no code-enforced expiry.
- **Deletion/withdrawal**: **no deletion or withdrawal endpoint exists** anywhere in
  `app/routers/pilot.py`, `app/services/pilot.py`, or `app/repositories/pilot.py`. A visitor who
  submits a number today has no self-service or support-assisted way to have it removed through this
  system.

**Stated plainly, not softened**: these are real, currently-absent controls, not minor gaps. They are
pre-existing conditions of the already-merged 1.1B pilot code (not introduced by this review or by
PR #34), but they are material to any decision to enable real phone capture — including the Milestone 2
Part B/C question of whether to add a *new* phone-collecting feature before these are addressed. This
review proposes no fix to them here (out of scope for a credential/delivery assessment), but any phone
capture put in front of real users should not proceed without a retention policy and a working deletion
path, at minimum.

## Minimal connectivity and controlled real-send procedure (not yet performed — blocked)

**Blocked on**: Twilio credentials (private setup above), a designated test phone number, and (per
item 2 above) Twilio's written answer on the use-case question — none have been provided to or
obtained by this session. Keeping `PILOT_SMS_PROVIDER` unset (or `logging-dev-only`) in every
environment reachable by real visitors; nothing here changes that.

Once all three are available, the planned sequence, smallest step first:
1. **Connectivity only — simulation evidence, not handset-delivery evidence.** Twilio publishes test
   credentials and test phone numbers specifically for this (a documented test Account SID/API Key
   pair that always returns a simulated success/failure without touching a real network or a real
   number). Worth using first to prove the adapter's request shape, auth, and response parsing are
   correct, with zero cost and zero regulatory exposure. **Explicitly not proof a real handset would
   receive anything** — it never leaves Twilio's test harness. Route-wise this is now unblocked (no
   DLT needed for the international route); it is still blocked on not having credentials.
2. **One real, controlled send** to the designated number only, with real (but newly created,
   spend-capped) credentials — the "one controlled real OTP delivery/verification" this task
   authorizes, nothing beyond it, and only after Twilio's written use-case answer is in hand, not just
   my reading of their published guideline.
3. Verify: the code is actually received, matches what the service generated (compared by the
   designated recipient reading their own phone — never by me reading or logging the code), and
   verifies successfully through `/v1/pilot/verify`. Then verify the **negative** case too: a wrong
   code is rejected without being treated as success.
4. Immediately after, confirm no SMS provider setting persists anywhere reachable by real visitors —
   production OTP stays disabled regardless of this test's outcome.

## Evidence this round, separated by type

**Automated, local** (this branch, base commit `23464ce`): full backend suite, 732/732 (729 existing
+ 3 new), run with the fix applied. The 3 new tests were additionally run in isolation against the
unfixed router (fix reverted, tests kept) to confirm they discriminate correctly — see the precise
pass/fail breakdown above, not a blanket "all pass" claim.

**Research, not simulation or device evidence**: the DLT and content-restriction findings above come
from Twilio's own published guidelines, fetched and quoted directly this round — not inferred from
memory, not fabricated, with the source linked.

**Not performed, explicitly**: any real network call to Twilio (no credentials), any real SMS send or
receipt (no credentials, no designated number), any device-side verification of a received code.

## Permission records (Milestone 2D)

`pilot_registrations.optional_updates_opted_in` is the only consent-adjacent field in this codebase —
assessed, and a smallest-appropriate extension proposed, in
`docs/execution/PERMISSION_RECORDS_ASSESSMENT.md`. Not implemented; doesn't block or get blocked by
anything else in this document.

## Before any real send or activation (unchanged from the original scope of this document)

Migrations 0004/0005, 1.1B enablement, consent wording, provider credentials, and any live SMS remain
separate deployment decisions. The approved 1.1A canary governance continues to prohibit 1.1B
activation until explicitly changed. Nothing in this round changes that.
