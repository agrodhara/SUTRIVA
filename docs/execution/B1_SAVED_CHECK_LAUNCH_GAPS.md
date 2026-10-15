# B1 saved-check — launch gaps, closed or explicitly reported

Milestone 2, round 2. Per instruction: "Close or explicitly report these launch gaps." Each of the six
named items below is marked **closed** (fixed and tested this round), **partially closed**, or
**open — reported** (not fixed, with the exact reason and what's needed). This document is itself
evidence, not a release decision — `savedCheckEnabled` stays `false`; nothing here authorizes activation.

## 1. Real email provider and designated-inbox delivery — **open; recommendation + exact steps below**

Unchanged technically: `app/services/email.py` has `LoggingEmailSender` only.
`SAVED_CHECK_EMAIL_PROVIDER=logging-dev-only` is the only working value; any other value fails closed
with `EmailProviderNotConfiguredError`. No real provider has been built or configured, and no email has
ever been sent to a real inbox. **Nothing in this section opens an account or creates a credential — it is
a recommendation and a precise procedure for the account owner to follow.**

### Recommendation: AWS SES

Given AWS/Lightsail is already this project's hosting platform (see `docs/execution/UAT_DEPLOYMENT.md`),
SES avoids a new vendor relationship entirely — the same account, billing, and IAM surface already in use.
Checked directly against AWS's own current documentation this round (not carried over from general
knowledge, which would risk being stale — AWS restructured SES pricing on **2026-07-21**):

- **Cost**: at this feature's volume (low hundreds to low thousands of emails/month), negligible either
  way — roughly **$0.10–0.16 per 1,000 emails** depending on which pricing plan the account is on
  (`aws.amazon.com/ses/pricing/`), i.e. a few tens of cents per month. No SES-specific free tier exists
  for AWS accounts created on or after 2025-07-15 (an older "first 3,000 free" tier was retired); new
  accounts instead get the **general $200 AWS Free Tier credit**, usable against SES among other services,
  not restricted to EC2/Lightsail specifically.
- **Domain verification is free and sendless**: publishing the DKIM/SPF DNS records and getting SES to
  report a domain "Verified" costs nothing and sends nothing — this can be done immediately after account
  creation, before any real send or any charge, and before deciding whether to request production access
  at all.
- **"Sandbox mode"** (the default for every new SES identity, per-region) restricts sending to only
  verified recipient addresses, 200 messages/24h, 1/second — which is actually sufficient for the
  designated-inbox test procedure below without ever requesting production access first.

**Compared briefly, not deeply researched**: Postmark (100 free/month, then $15/mo for 10,000) and Resend
(3,000 free/month, capped 100/day) are both reasonable alternatives with simpler onboarding than AWS's
IAM/DNS model — worth a second look if the AWS-account-reuse argument doesn't carry as much weight as
assumed here. This document still recommends SES primarily for the single-vendor-surface reason above, not
because it is cheaper (at this volume, the difference is immaterial).

### Exact setup steps (for the account owner — not performed by this session)

1. In the SES console (the **existing** AWS account — matching this project's own "reuse the existing
   account" discipline already applied to Twilio): **Identities → Create identity → Domain**, enter the
   sending domain, choose **Easy DKIM**.
2. Publish the DNS records SES shows under that identity's **Authentication** tab: three DKIM CNAME
   records (keep the leading underscore in `_domainkey`), and, for SPF/DMARC alignment, set up a **custom
   MAIL FROM domain** (a subdomain, e.g. `mail.sutriva.io`) for the MX + SPF TXT record SES provides, plus
   a self-authored `_dmarc.<domain>` TXT record (start with `p=none` and tighten later, per DMARC's own
   phased-rollout convention). DNS propagation can take up to 72 hours; SES auto-detects verification.
3. **Nothing above requires leaving sandbox mode or any real send.** Once "Verified" appears, proceed to
   the designated-inbox test below while still in sandbox — sandbox explicitly allows sending to a
   *verified* recipient address, which the test procedure uses anyway.
4. Create a dedicated IAM user (or role) scoped to exactly this use, not a broad admin credential:
   attach a policy granting only `ses:SendEmail` and `ses:SendRawEmail` (scopable further to this
   specific identity's ARN). Generate SES **SMTP credentials** for it (SES console → SMTP Settings →
   Create SMTP credentials) if sending via SMTP, or a standard IAM access key pair if sending via the SES
   API directly — these are two different credential *shapes* for the same underlying IAM user; an IAM
   access key does not work as SMTP credentials directly.
5. **Only request production access** (Account dashboard → "Request production access") once the
   designated-inbox test below has passed and real, un-capped sending is actually wanted — this step is
   what actually commits to real-world sending volume and should be a deliberate, separate decision, not
   bundled into initial setup.

### Credential names (empty template — matching this project's existing `.env.example` convention)

```
SAVED_CHECK_EMAIL_PROVIDER=aws-ses          # selects the (not-yet-built) SES adapter
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_REGION=                                  # e.g. ap-south-1
SES_CONFIGURATION_SET=                       # optional, for bounce/complaint tracking
```

No value for any of these has been requested, generated, or exposed in this session.

### Designated-inbox test procedure (once the above is in place — not yet performed)

1. In SES (still in sandbox — no production access needed for this step), **verify the designated test
   inbox itself** as a recipient identity (Identities → Create identity → Email address → the actual
   inbox you'll check) — sandbox mode requires the *recipient* to be verified too, not only the sender
   domain.
2. Send one real email via the (not-yet-built) `AwsSesEmailSender` adapter to that verified address,
   reusing the exact same `send_or_raise` discipline `app/services/email.py` already has for the logging
   stub — a rejected send must still roll back the save, never show a false "sent" confirmation.
3. Confirm receipt by reading the actual inbox (never by this session reading or logging the email body
   or the link/token it contains — same discipline already applied to the Twilio OTP test plan).
4. Confirm the negative case too: an intentionally invalid/unverified recipient address is rejected by
   SES and surfaces as `email_send_failed`, not a false success — mirroring the existing
   `test_a_rejected_email_send_never_produces_a_saved_row` test, now exercised against the real provider
   instead of only the test double.

Blocked on the account owner's action (account/IAM access this session doesn't have) for steps 1–2 above;
everything else (the adapter code itself, following `TwilioSmsSender`'s exact pattern) remains independent
work this session can do once a provider decision is confirmed.

## 2. Token/access security, expiry, revocation, leakage prevention — **closed this round**, one residual noted

**Closed**: the retrieval token no longer appears in any path or query value anywhere, at either the
frontend or backend layer — a real architectural change this round, not a planned one:
- The backend's `GET`/`DELETE /v1/saved-borrow-checks` now read the token from an `X-Saved-Check-Token`
  header, never a path segment. A required-header design was tried first and **found to leak the route's
  existence through a 422 even while the feature flag is off** — caught by direct testing before this
  shipped, fixed by making the header optional and checking it only after the flag check. See the
  regression test `test_a_request_with_no_token_header_at_all_still_404s_while_disabled_not_422`.
- The frontend's own link changed from `/saved/{token}` (a Next.js dynamic path segment) to `/saved#{token}`
  (a URL **fragment**). A fragment is never transmitted in an HTTP request at all, so neither the PWA's own
  server nor nginx in front of it ever sees the token either — this closes the frontend half of the same
  problem, not just the API half.
- **Expiry**: 90 days by default (`SAVED_CHECK_RETENTION_DAYS`), enforced in `retrieve_saved_borrow_check`
  — tested (`test_an_expired_saved_check_is_not_retrievable`).
- **Revocation**: "Delete this saved check" *is* the revocation mechanism — a soft delete makes the token
  permanently unusable immediately (`test_deleting_a_saved_check_makes_it_no_longer_retrievable`). There is
  no separate, narrower "revoke without delete" concept, because nothing else depends on the token besides
  reaching the saved data itself.
- **Brute force**: the token is 256 bits of randomness (`secrets.token_urlsafe(32)`) — infeasible to guess
  even without rate limiting, though the existing per-IP retrieval limiter is a second, independent layer
  regardless.

**Added this round (round 3), per explicit instruction that a URL fragment "reduces access-log leakage;
it does not establish complete token security"** — correct, and checked as four separate, additional
dimensions rather than treated as covered by the fragment change alone:
- **Cache controls**: checked directly, not assumed — no middleware anywhere in this codebase set a
  `Cache-Control` header by default (confirmed by curling a running instance). A GET response carrying a
  stored financial result could otherwise be retained by a browser's own caching heuristics or a shared
  intermediate cache, e.g. on a shared device. **Fixed**: `Cache-Control: no-store, no-cache,
  must-revalidate, private` + `Pragma: no-cache` now set on the save/retrieve/delete success responses —
  tested directly (`test_responses_carrying_a_stored_result_are_never_cacheable`). Error responses don't
  carry this header (FastAPI's exception handling doesn't apply the injected `Response` object's headers
  to them), stated precisely rather than claimed for "all responses" — acceptable since error responses
  here carry no sensitive data.
- **Browser storage**: checked — no `localStorage`, `sessionStorage`, or IndexedDB usage exists anywhere in
  the saved-check frontend code. Confirmed absent by direct search, not assumed from the design.
- **Analytics exposure**: checked — this codebase has no global/automatic page-view or analytics beacon
  anywhere (the root `layout.tsx` is minimal; `trackEvent` is only ever called explicitly per-component).
  The `/saved` retrieval page never calls `trackEvent` at all, so no analytics mechanism in this codebase
  could see the token even in principle — confirmed by reading the actual layout and grepping for any
  such wiring, not assumed from "we didn't add one."
- **Deletion**: re-confirmed unchanged from the original closure above — immediate, user-visible, tested.

**Residual, not closed, explicitly reported**: this project has **no `Referrer-Policy` header configured
anywhere** (checked — absent from `docs/execution/UAT_DEPLOYMENT.md`'s documented header set, which lists
`X-Robots-Tag` but not this). This is a **pre-existing, site-wide gap**, not introduced by this feature —
but it matters more now that a page carries a token in its fragment: if the retrieval page ever loads a
third-party resource in the future (it does not today — no external script or font on `/saved`), that
resource request could, in principle, still disclose `document.referrer`'s path (not the fragment itself,
which browsers never include in `Referer` either, but worth closing properly rather than relying on
"we don't currently load anything external"). **Recommended, not applied**: add
`Referrer-Policy: strict-origin-when-cross-origin` (or `no-referrer`) at the nginx layer for the whole
site, which is outside what this round can apply — SSH to `sutriva-alpha` remains blocked, and this is a
site-wide nginx config change, not something scoped to this one feature's own files.

## 3. Backend enforcement of `savedCheckEnabled=false` — **closed, re-verified**

Already true before this round and **re-confirmed, not merely restated**: `_require_saved_check_enabled()`
runs first in every route and returns `404` (not `403` or `422`), indistinguishable from a route that
doesn't exist — `test_all_routes_404_when_saved_check_is_disabled`. The header-based token redesign
(item 2) introduced a real risk of **weakening** this exact guarantee (a required header 422ing before the
flag check could run) — caught and fixed, with its own dedicated regression test
(`test_a_request_with_no_token_header_at_all_still_404s_while_disabled_not_422`), so this guarantee is
demonstrably stronger after this round, not just unchanged.

## 4. Scheduled retention purge and deletion behaviour — **wired and validated on a real systemd, not installed**

**Closed**: `purge_expired_and_deleted` (bounded batch, same contract as the existing anonymous-session
purge) is implemented and tested — expired rows removed, active rows kept, soft-deleted rows removed only
past a grace window (`SAVED_CHECK_DELETE_GRACE_HOURS`, default 24h), not immediately. A CLI entry point,
`app/purge_saved_borrow_checks.py`, mirrors `app/purge_anonymous_data.py`'s exact shape for operational
consistency.

**Wired and validated this round**: `ops/systemd/sutriva-purge-saved-borrow-checks.{service,timer}` —
prepared systemd unit files (every 15 minutes, `Persistent=true` so a missed run fires at next boot rather
than waiting a full interval). This machine (macOS) has no `systemd` itself — resolved this round, per
instruction to validate on a compatible environment rather than document around the gap, with a disposable
`debian:bookworm-slim` Docker container (destroyed after use, never a host) that has a real `systemd 252`.
`systemd-analyze verify` first correctly **failed** against the unit files exactly as written — real
validation catching that `/opt/sutriva/venv/bin/python` doesn't exist in that throwaway container (it
legitimately only exists on the real host) — then **passed cleanly (exit 0, no warnings)** once that
expected host layout was stubbed in the container. This confirms the unit syntax itself is valid against a
real systemd binary, not merely plausible-looking INI text. See `ops/systemd/README.md` for the full
detail, including explicit install, post-install verification, and disable instructions — **none of which
have been performed: not copied to any host, not enabled, not started anywhere.**
This closes the scheduling gap for *this* job specifically; the identical, pre-existing gap on
`app/purge_anonymous_data.py` would close the same way but is not itself touched by this change.

**Deletion behaviour, specifically**: a visitor's "Delete this saved check" action is immediate and
user-visible (the row is unretrievable right away — closed, tested), but the underlying row's hard
removal from the database waits for the next purge run, which — per the above — has no confirmed cadence
yet. Stated plainly: a deleted check is inaccessible to anyone immediately, but not necessarily physically
removed from the database on a known schedule until the purge job is actually scheduled.

## 5. Clear notice and persisted service-request evidence — **closed this round**

Previously: no evidence existed of what notice text a visitor saw when they requested a save. **Added**:
`saved_borrow_checks.notice_version` (migration `0009`), populated from
`app/services/saved_borrow_checks.py`'s `SAVE_CHECK_NOTICE_VERSION` constant on every save — a short,
bounded identifier for the exact notice copy shown at that moment, not the notice text itself. If
`SaveCheckForm.tsx`'s wording is ever revised, a past row stays attributable to what it actually agreed to,
rather than being silently reinterpreted under later wording. Tested
(`test_a_save_records_the_current_notice_version_as_request_evidence`). This is **request evidence for a
requested service action**, explicitly not reframed as a consent record — see
`PERMISSION_RECORDS_ASSESSMENT.md`'s corrected Part D reasoning (the earlier, too-categorical "no consent
flow needed" conclusion has been withdrawn there, not merely left standing here).

**Strengthened this round, per explicit instruction to verify "notice_version maps to immutable notice
text and timestamped request evidence"** — the version string alone, from the previous round, was not yet
proof of anything: nothing pinned what text a given version actually referred to, so a future wording
edit could silently redefine what an old version "meant." Closed with
`app/saved_check_notice_versions.py`: an append-only, structurally immutable (`MappingProxyType` — item
assignment raises `TypeError`, tested directly) registry mapping each version string to its exact, frozen
text. A new test reads `SaveCheckForm.tsx`'s actual source file and confirms the registered text matches
what it currently renders — a mechanical check, not a comment asking future edits to remember to update
two places. **Timestamped request evidence**: `created_at` (already on the row, server-default `now()`)
is the timestamp of the same request the `notice_version` and all other saved fields belong to — one
timestamp for the whole request, not a separately-timed, driftable field.

## 6. Minimal save/retrieval measurement with no sensitive payloads — **closed, demonstrated end-to-end**

Two structured `INFO`-level log lines (`app/services/saved_borrow_checks.py`): one on a successful save,
one on a successful retrieval. Each carries only `situation_key` and (for save) `provenance` — **never**
the email address, the raw or hashed token, or any input/result value.

**A real bug in this claim was found and fixed this round, not glossed over**: the previous round's
version of these log lines passed `situation_key`/`provenance` only via `extra={...}`, which populates
`LogRecord` attributes that Python's *default* `Formatter` does not render into the printed line at all —
visible to a test harness reading `LogRecord` objects directly, but invisible in any real log output.
Worse, **this application configures no logging handler anywhere** (confirmed by actually running the real
server and capturing its real stdout: nothing appeared for these calls at all, not even in the wrong
format) — Python's root logger has no handler and its default `WARNING` level silently drops every
`INFO` call regardless. Both are fixed: the safe fields are now interpolated directly into the log message
text (so they survive any formatter), and `app/main.py` now explicitly configures a handler and `INFO`
level scoped to exactly this one logger — not the root logger, so no other logger (SQLAlchemy, uvicorn's
own) becomes more verbose as a side effect.

**Demonstrated end-to-end against real captured output, not asserted from tests alone**: ran the actual
server locally, made four real save requests (two `offer`, one `debt`, one `purchase`) and two real
retrievals, and captured its genuine stdout:

```
2026-10-15 07:11:38,832 INFO app.services.saved_borrow_checks: saved-check saved situation_key=offer provenance=own
2026-10-15 07:11:38,846 INFO app.services.saved_borrow_checks: saved-check saved situation_key=offer provenance=own
2026-10-15 07:11:38,859 INFO app.services.saved_borrow_checks: saved-check saved situation_key=debt provenance=own
2026-10-15 07:11:38,870 INFO app.services.saved_borrow_checks: saved-check saved situation_key=purchase provenance=own
2026-10-15 07:11:39,006 INFO app.services.saved_borrow_checks: saved-check retrieved situation_key=offer
2026-10-15 07:11:39,015 INFO app.services.saved_borrow_checks: saved-check retrieved situation_key=offer
```

Counted directly from this real file with plain shell tools an operator could actually run against a real
log (no special tooling built or required):

```
$ grep "saved-check saved" server.log | grep -oE "situation_key=[a-z]+" | sort | uniq -c
   1 situation_key=debt
   2 situation_key=offer
   1 situation_key=purchase
$ grep -c "saved-check saved" server.log       # 4 — matches the 4 real saves made
$ grep -c "saved-check retrieved" server.log   # 2 — matches the 2 real retrievals made
```

The counts matched the real actions taken exactly. Separately confirmed the captured file contains none of
the email addresses, the demo retrieval token, or any result content used during this demonstration — a
direct `grep`, not an assumption. Verified directly by test as well, now asserting on the actual rendered
`getMessage()` text, not only `LogRecord` attributes
(`test_a_successful_save_and_retrieval_log_minimal_safe_measurement_only`,
`test_importing_the_app_configures_the_measurement_logger_to_actually_produce_output`).

Deliberately **not** a `product_events` analytics row: adding one would mean widening
`ck_product_events_screen_name`'s allowlist, which this round keeps out of scope (a schema change to an
unrelated, already-reviewed constraint). A failed-token retrieval attempt is deliberately **not** logged at
all — logging per-attempt would itself be a token-guessing oracle in the logs, and the existing per-IP rate
limiter is the actual control against that, not a log line. This is log-based measurement an operator can
aggregate with plain shell tools against real log output, not a real-time dashboard metric — proportionate
to "minimal," not a claim of more.

## Testing note

All of the above is tested with synthetic data only (`visitor@example.com`, fabricated rupee figures,
fabricated result copy) — no real email address, phone number, or financial detail was used anywhere in
this round's testing, consistent with standing instruction. No live retrieval token, OTP code, or full
contact detail has been printed in this session; where a token value appears in test code
(`"test-fixed-token"`) it is a hardcoded test fixture, not a real generated secret.
