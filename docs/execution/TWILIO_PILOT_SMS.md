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

| Variable | Purpose | Status (checked 2026-10) |
|---|---|---|
| `PILOT_SMS_PROVIDER` | Must equal `twilio` to select this adapter at all; any other/unset value means no SMS provider is selected | **Not set anywhere this review has access to** |
| `TWILIO_ACCOUNT_SID` | Owning Twilio account SID | **Not set** |
| `TWILIO_API_KEY_SID` | A server-side API Key's SID (see Authentication below) | **Not set** |
| `TWILIO_API_KEY_SECRET` | That API Key's secret | **Not set** |
| `TWILIO_MESSAGING_SERVICE_SID` | The Messaging Service to send through | **Not set** |
| `PILOT_OTP_HMAC_KEYS` | Signs/verifies OTP codes at rest (comma-separated, newest first) — **required independently of Twilio**; without it the service fails closed (`otp_signing_key_not_configured`), it is not specific to any SMS provider | **Not set** |

No value is printed anywhere in this document or was requested in chat. "Status" above reflects
this local/review environment and `sutriva-alpha`'s last-known state before SSH access was lost
(2026-10-08) — **not rechecked this round**; see the PR #33 follow-up section of
`SITUATIONS_REDESIGN.md` for why a fresh host check needs restored access, and the same applies
here.

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

1. In the Twilio Console, under the account that will own this: **Account → API keys & tokens →
   Create API key** (Standard type). This produces the SID and secret pair — **the secret is shown
   once**; store it immediately in the host's secret manager or `/etc/sutriva/api.env` (mode
   `0600`), never in a message to me, a commit, or a shell history.
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

## India delivery requirements — researched, not assumed (checked 2026-10, via Twilio's own published guidelines)

Two separate, both unresolved, both **real blockers for anything beyond a single controlled test**:

**1. DLT registration (regulatory, not a Twilio preference).** India's TRAI mandates DLT
(Distributed Ledger Technology) registration for commercial SMS — this covers transactional and OTP
messages, not only promotional ones. Per Twilio's own guidelines
([twilio.com/en-us/guidelines/in/sms](https://www.twilio.com/en-us/guidelines/in/sms)):
completing entity and Sender ID registration on a mobile operator's DLT portal is required *before*
registering with Twilio; an **alphanumeric Sender ID takes about 10 business days** to provision
once submitted; **long codes (ordinary phone numbers) are not supported for domestic India SMS at
all**; and unregistered domestic messages **are blocked by operators**, not merely degraded.
**This has not been started.** It is a multi-day, external, business-entity-level compliance
process — not something achievable in this session, and not something I can do on your behalf.
There is also a documented **international routing pathway** that bypasses DLT (random
international short codes, no DNC-list interaction) — this is likely what lets a single test
message go through *before* DLT is in place, but it is not a compliant or reliable basis for any
ongoing or production delivery to Indian numbers.

**2. Content restriction — this resolves the "assess" item this document already flagged.** Twilio's
same India guidelines page states, verbatim: *"Sending firearms, gambling, adult content,
**money/loan**, political, religious, controlled substance, cannabis, and alcohol related content is
strictly prohibited."* Sutriva's product is a money/loan-comparison service. **Fact**: this
restriction is published and applies to India SMS sent via Twilio. **Inference, not confirmed**:
read in context with Twilio's broader messaging-category guidance, this almost certainly targets
message *content* — promotional loan offers, gambling-adjacent solicitation — not the *existence* of
a neutral OTP verification message from a company that happens to operate in financial services
(banks and lenders routinely send Twilio-delivered OTPs in India; the current message body contains
no loan terms, amounts, or promotional language at all). **Unknown, and the actual risk**: whether
Twilio's own account-compliance review would classify this *account's declared use case* under the
restriction regardless of the neutral wording of any one message. **This should be resolved by
asking Twilio directly** (via their compliance/support channel, stating the exact OTP-only use case
and the exact message body) **before** relying on the account for anything beyond the one controlled
test this task authorizes — not inferred silently, and not treated as cleared by my reading alone.

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

## Minimal connectivity and controlled real-send procedure (not yet performed — blocked)

**Blocked on**: Twilio credentials (private setup above) and a designated test phone number — neither
has been provided to this session. Keeping `PILOT_SMS_PROVIDER` unset (or `logging-dev-only`) in every
environment reachable by real visitors; nothing here changes that.

Once both are available, the planned sequence, smallest step first:
1. **Connectivity only, no real send, no cost**: Twilio publishes "magic" test credentials and test
   phone numbers specifically for this (e.g. a documented test Account SID/API Key pair that always
   returns a simulated success/failure without touching a real network or a real number) — worth using
   first to prove the adapter's request shape, auth, and response parsing are all correct, with zero
   cost and zero regulatory exposure, before touching the real account at all.
2. **One real, controlled send** to the designated number only, with real (but newly created,
   spend-capped) credentials — explicitly the "one controlled real OTP delivery/verification" this
   task authorizes, nothing beyond it, and only after the content-restriction question above has an
   answer from Twilio, not just my reading of their published guideline.
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

## Before any real send or activation (unchanged from the original scope of this document)

Migrations 0004/0005, 1.1B enablement, consent wording, provider credentials, and any live SMS remain
separate deployment decisions. The approved 1.1A canary governance continues to prohibit 1.1B
activation until explicitly changed. Nothing in this round changes that.
