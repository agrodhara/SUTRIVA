# B1 saved-check specification (Milestone 2B — recommendation, not built)

This is a proposed specification for Milestone 2B: letting a visitor save a completed Borrow Better
(B1) check and reopen it later. **Nothing in this document is implemented.** It is scoped to B1 only
(`debt`, `purchase`, `offer`, `rejected` — the four `comfortable_borrowing` situations), per the
instruction that prompted it; R1 would plausibly reuse the identical mechanism later, as its own
decision.

**Terminology note, honoring the distinction the instruction that prompted this document drew:** this
is a **saved check** — one specific result, stored and reopenable byte-identical later. It is not a
**comparison** in the sense of a new side-by-side, multi-offer UI; building that would be a materially
larger redesign of the result screen and is explicitly out of scope for this specification. It is also
not the existing pilot-interest email registration, which stores no output and cannot be reopened —
continuing not to call that "saving," per standing instruction.

## Customer benefit

Today, closing the tab loses the result. A visitor comparing two loan offers, or checking back after
their income changes, has to re-enter every figure from scratch with no way to see what they found
before. Saving the actual result — not just registering interest — lets them return to one specific
check, on any device, without re-entering anything.

## What already exists to build on

- `SituationResult` (`apps/pwa/app/situations/situationsApi.ts`) is already the exact, stable shape a
  saved record would store — `title`, `headline`, `detail`, `insight`, `scenario`, `note`, `bars`. No
  new result shape needs inventing.
- The provenance concept (`example` / `mixed` / `own`) already exists and already governs how a result
  is labelled — a saved record should carry it forward so a reopened check is labelled the same way a
  live one would be.
- `anonymous_sessions` / the 90-day absolute-expiry convention is an already-reviewed number this spec
  reuses for retention, rather than inventing a new one.
- The existing bounded-batch retention-purge pattern (already used for anonymous sessions/events) is the
  template for this feature's own purge job — not a new pattern.
- 1.1B's OTP pathway (`pilot_registrations`, `otp_challenges`) already exists, built and reviewed, as one
  of the two authentication options compared below — but enabling it is a separate, already-governed
  decision this spec does not reopen.

## What's missing

- No table persists a check's inputs or result today — `services/api/app/services/situations.py` is
  purely stateless (confirmed by inspection: it contains no `INSERT`, `session.add`, or `.commit()`
  anywhere).
- No retrieval endpoint or page exists.
- **No outbound-email capability exists anywhere in this codebase** — the pilot-interest table only ever
  stores an email address; nothing ever sends one. This is a genuinely new piece of infrastructure, not
  an extension of something already built (see Authentication options and Estimate below).

## Data stored

A new table, `saved_borrow_checks` (named for this B1-only scope, not a generic
`saved_situation_results` — rename if R1 is added later and the two are merged):

| Column | Notes |
|---|---|
| `saved_borrow_check_uuid` | PK |
| `situation_key` | `CHECK` constrained to exactly `debt`, `purchase`, `offer`, `rejected` |
| `anonymous_session_uuid` | nullable FK → `anonymous_sessions`, best-effort link, same pattern as `situation_pilot_interest` |
| `access_email` | nullable — populated only under the email-retrieval option below |
| `pilot_registration_uuid` | nullable FK → `pilot_registrations` — populated only if the OTP-retrieval option is ever added |
| `input_values` | the situation's own field values as entered (bounded JSON — validated server-side against the exact same field set `toRequestBody` already validates for the live calculation, never accepted as free-form) |
| `provenance` | `example` / `mixed` / `own` |
| `result_title`, `result_headline`, `result_detail`, `result_insight`, `result_scenario`, `result_note`, `result_bars` | the exact `SituationResult` fields, stored as returned — never recalculated on save or on retrieval |
| `retrieval_token_hash` | HMAC'd at rest, identical discipline to OTP codes — the raw token is never stored |
| `created_at`, `expires_at` | retention window, see below |
| `deleted_at` | nullable — a visitor-initiated delete sets this rather than issuing a hard `DELETE`, so the retention-purge job has one consistent sweep to run instead of two delete paths; a `deleted_at IS NOT NULL` row is always treated as gone for retrieval purposes regardless of `expires_at` |

**Migration required.** New table only — no change to any existing table or column. Present here as a
schema change for separate review, per standing instruction; not something this document authorizes.

## Versioning

A save is a point-in-time **snapshot**, never mutated. Re-running the check and saving again creates a
new row, not an update to the old one — avoids any ambiguity about a saved result silently changing
after the fact, and needs no explicit version-number column: `created_at` already orders a visitor's
saved checks if more than one exists. Retrieval always renders exactly what was saved, never a fresh
recalculation.

## Retrieval

A GET endpoint validates the token (hash comparison, same discipline as OTP verification), confirms
`deleted_at IS NULL` and `expires_at > now()`, and returns the stored snapshot. Reusable until expiry
or deletion (not single-use like an OTP code) — reopening a saved check to look at it again is a
legitimate repeat action, not a one-time proof of possession. Rendered with the **existing** result
layout components, populated from the saved row instead of a live calculation — no new result UI.

## Authentication options — compared, not assumed

**Option A — email magic link (recommended for v1).**
A visitor enters an email at a "save this" prompt; the backend generates a random token, emails a link
containing it, stores only the token's hash. No phone number involved anywhere.
*Requires*: building a new, small `app/services/email.py` adapter (mirroring `app/services/sms.py`'s
exact fail-closed-when-unconfigured structure) and provisioning a transactional email provider (e.g.
AWS SES, given AWS/Lightsail is the existing hosting platform) with domain verification (SPF/DKIM) — a
real, external, DNS-dependent step, but materially smaller and lower-regulatory-risk than the Twilio
DLT/content-restriction situation found in the Milestone 2A assessment.
*Trade-off*: a link can be forwarded or sit in an inbox someone else later accesses — weaker proof that
only the requester can reopen it than a verified phone. Mitigated by expiry and by the token being
unguessable, not by identity verification.

**Option B — OTP-verified phone (not recommended for v1).**
Reuses the existing, built 1.1B OTP pathway. Stronger identity proof (possession of the phone is
verified), and no new provider category to build — but genuinely contingent on two things outside this
spec's control: enabling 1.1B in production, which current governance explicitly prohibits until
separately changed, and the Milestone 2A Twilio findings (DLT/route status, and specifically the
still-open money/loan content-restriction question) being resolved first, since any real OTP send
depends on both regardless of which feature triggers it.

**Recommendation: Option A for v1.** It is the only option that doesn't require reopening either the
1.1B activation decision or the Twilio use-case question — it introduces exactly one new dependency
(email sending), not two. Do not assume phone is necessary; nothing about "saving a check" requires the
stronger identity guarantee an OTP gives, and the weaker one is proportionate to what's being
protected (your own saved calculation, not an irreversible action).

## Retention / deletion

- Default retention: 90 days from `created_at`, matching the existing anonymous-session convention —
  reused, not invented.
- A scheduled, bounded-batch purge job (same pattern as the existing session/event purge) hard-deletes
  rows past `expires_at` or already soft-deleted past a short grace window.
- The retrieval page offers an explicit "Delete this saved check" action, setting `deleted_at`
  immediately (visible as gone to the visitor right away) with the hard delete following at the next
  purge run — not a fabricated delete that merely hides the row from one view.
- Raw financial inputs held this way carry the same sensitivity class as what's already transiently held
  during a live check — needs its own explicit retention/privacy-notice sign-off at the same level of
  care as the existing audit-log redaction rules, not assumed covered by analogy.

## Customer wording (draft — for review, not final copy)

- **Save prompt** (on the result screen, a separate, clearly distinct action from the existing pilot-
  interest form, not merged with it): heading *"Save this check to look at again later?"*; body *"We'll
  email you a private link to this exact result. It isn't shared with anyone else and isn't linked to
  any account."*; field *"Email address"*; button *"Email me this result"*.
- **Confirmation**: *"Sent — check your email for a link back to this result."*
- **Email**: subject *"Your saved Sutriva check"*; body states what it is, includes the link, and *"This
  link works for 90 days. If you didn't request this, you can ignore this email."*
- **Retrieval page**: heading *"Your saved check"*, the result itself, *"Saved on {date}"*, and *"Delete
  this saved check"*.

**Excluded from v1, explicitly**: any wording or mechanism for sharing a saved check with a co-decision-
maker (spouse, parent, etc.) — the instruction that prompted this spec excludes it, and it would add a
second identity (the recipient) and a second consent question this document does not attempt to answer.

## Acceptance checks

- A valid save persists exactly the inputs and result shown, retrievable byte-identical later.
- An invalid email is rejected client- and server-side; never silently "saved" against a bad address.
- A wrong, expired, or deleted token shows a clear "no longer valid" state — never partial data, never
  another visitor's row.
- The retention-purge job actually removes rows past the window, verified by a test, not only documented.
- Visitor-initiated deletion actually removes the row (post-purge), verified by a test.
- No input value, result value, or email appears in any log, URL, or analytics event — the same rule
  already enforced everywhere else in this codebase.
- An email-send failure never shows a false "saved and emailed" success — mirrors the existing
  `send_or_raise`/`SmsSendRejectedError` discipline byte-for-byte, applied to the new email adapter.

## Implementation estimate — by actual task, not a multiplier of an earlier feature

No team-velocity data exists to convert this into calendar time, so it's sized in units this project
already has real examples of, each comparable to a specific prior PR:

1. **Migration + save/retrieve/delete routes + tests, no real email yet** (a logging-only sender
   stub, matching `LoggingSmsSender`'s exact role for OTP) — comparable in scope to the pilot-interest
   migration + router + service + its ~20-test suite (PR #26/#29-era work).
2. **Real email provider integration**: adapter, domain verification, the retention-purge job, and its
   own failure-path tests — comparable in scope to the Twilio SMS adapter PR (PR #26), though lower
   external-compliance overhead (no India-specific DLT/content-restriction equivalent known for
   transactional email).
3. **Frontend**: the save prompt component, the new retrieval page, delete-confirmation UI, and their
   tests — comparable in scope to the pilot-interest-form-on-arrival-screen work (PR #32/#33 in this
   engagement).
4. **Not engineering, but blocking**: copy/legal sign-off on the retention policy and email wording —
   can run in parallel with 1–3, but gates actually launching regardless of code readiness.

Three PR-sized units, each with a real precedent in this project to calibrate against, plus one
non-engineering dependency that can block launch independent of code status.
