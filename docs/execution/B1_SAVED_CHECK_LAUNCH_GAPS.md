# B1 saved-check — launch gaps, closed or explicitly reported

Milestone 2, round 2. Per instruction: "Close or explicitly report these launch gaps." Each of the six
named items below is marked **closed** (fixed and tested this round), **partially closed**, or
**open — reported** (not fixed, with the exact reason and what's needed). This document is itself
evidence, not a release decision — `savedCheckEnabled` stays `false`; nothing here authorizes activation.

## 1. Real email provider and designated-inbox delivery — **open, reported**

Unchanged from the original assessment: `app/services/email.py` has `LoggingEmailSender` only.
`SAVED_CHECK_EMAIL_PROVIDER=logging-dev-only` is the only working value; any other value fails closed
with `EmailProviderNotConfiguredError`. No real provider (AWS SES or otherwise) has been built or
configured, and no email has ever been sent to a real inbox. Blocked on the same kind of input the Twilio
assessment is blocked on: a provider decision, credentials, and domain verification (SPF/DKIM) — none of
which exist yet. See `B1_SAVED_CHECK_SPEC.md`'s "Implementation estimate" for the scope of this remaining
work.

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

## 4. Scheduled retention purge and deletion behaviour — **partially closed, scheduler itself open**

**Closed**: `purge_expired_and_deleted` (bounded batch, same contract as the existing anonymous-session
purge) is implemented and tested — expired rows removed, active rows kept, soft-deleted rows removed only
past a grace window (`SAVED_CHECK_DELETE_GRACE_HOURS`, default 24h), not immediately. A CLI entry point,
`app/purge_saved_borrow_checks.py`, mirrors `app/purge_anonymous_data.py`'s exact shape for operational
consistency.

**Open, reported honestly**: **no scheduler actually calls this.** Checked directly, not assumed: the
*existing* anonymous-session purge entry point has the identical gap — no cron entry or scheduler wiring
for it exists anywhere in `docs/execution/UAT_DEPLOYMENT.md` either. This is a **pre-existing, site-wide
gap this feature inherits, not one it introduces** — reported rather than silently treated as solved by
the CLI module merely existing. Closing it for real requires a cron entry (or equivalent) on
`sutriva-alpha`, which this session cannot apply (SSH blocked) and which should cover both purge jobs
together when it is set up, not just this one.

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

## 6. Minimal save/retrieval measurement with no sensitive payloads — **closed, minimal by design**

Added two structured `INFO`-level log lines (`app/services/saved_borrow_checks.py`): one on a successful
save, one on a successful retrieval. Each carries only `situation_key` and (for save) `provenance` —
**never** the email address, the raw or hashed token, or any input/result value. Verified directly by
asserting none of those sensitive values appear in the log text
(`test_a_successful_save_and_retrieval_log_minimal_safe_measurement_only`). Deliberately **not** a
`product_events` analytics row: adding one would mean widening `ck_product_events_screen_name`'s allowlist,
which this round keeps out of scope (a schema change to an unrelated, already-reviewed constraint). A
failed-token retrieval attempt is deliberately **not** logged at all — logging per-attempt would itself be
a token-guessing oracle in the logs, and the existing per-IP rate limiter is the actual control against
that, not a log line. This is log-based measurement an operator can aggregate from log output, not a
real-time dashboard metric — proportionate to "minimal," not a claim of more.

## Testing note

All of the above is tested with synthetic data only (`visitor@example.com`, fabricated rupee figures,
fabricated result copy) — no real email address, phone number, or financial detail was used anywhere in
this round's testing, consistent with standing instruction. No live retrieval token, OTP code, or full
contact detail has been printed in this session; where a token value appears in test code
(`"test-fixed-token"`) it is a hardcoded test fixture, not a real generated secret.
