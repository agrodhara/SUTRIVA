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

## Which option, and why (Milestone 2B decision)

Three options were on the table: (1) save/reopen a loan comparison (B1), (2) save/reopen a card-fee
review (R1), (3) an assisted review by an actual person.

**Option 3 ruled out, checked rather than assumed**: ruled out per its own stated condition — "only if
an actual reviewer and response process exists." Searched this codebase and its docs for any
human-review pipeline, ticketing system, or response process (CRM, helpdesk, support-ticket table,
reviewer queue): **found none**. The only "reviewer" anywhere in this project's docs
(`docs/execution/DELIVERY_GATE.md`) refers to an engineering PR code-reviewer, not a customer-facing
financial reviewer. There is no one to route a request to and no mechanism to respond through. Building
the review *process* itself (hiring or designating a reviewer, a queue, an SLA, a response channel) is
a different, much larger undertaking than this spec and is out of scope here.

**B1 vs. R1**: technically near-identical — both situations groups share the same `SituationResult`
shape, the same calculation pattern, and the same already-deployed pilot-interest form, so there is no
capability difference that makes one cheaper to build. (One candidate piece of evidence was checked and
rejected as not actually distinguishing: both `offer` (B1) and `fee` (R1) are independently labelled
"lead path" in `docs/execution/SITUATIONS_REDESIGN.md` and the test suite — one per journey, not a
cross-journey priority signal, so this does **not** show B1 was already prioritized over R1. Noting
that rather than quietly using it as false support.) The actual basis for recommending B1 first is
customer-benefit reasoning, not a technical one: a loan decision (comparing offers, checking back after
income or a new offer changes the picture) is plausibly a multi-day, multi-offer consideration process
that benefits more from being saved and revisited than a card-fee check, which is typically a single,
immediate yes/no decision with less to gain from persisting across sessions. This is a judgment call
about customer benefit, not a measured fact — stated as such. **Recommendation: build B1 first,
R1 can reuse the identical mechanism afterward** — the schema below already accommodates this (see
"Why a new table" below), so extending to R1 later is additive, not a rebuild.

## Why a new table — existing tables checked, not assumed insufficient

Per the instruction not to assume a new schema is needed, both existing candidate tables were checked
directly rather than skipped past:

- **`situation_pilot_interest`** (migration `0007`): its own migration docstring states its job is "to
  tell the operator which situations generated interest, not just who is interested" — it stores no
  input values and no result snapshot, and its unique index is `(email, situation_key)`, which would
  structurally forbid saving more than one check per email per situation (e.g. comparing two different
  loan offers over time, or re-checking after an income change) — exactly the use case this feature
  exists for. Extending it would also silently redefine what every existing row in that table means,
  conflating "I'm interested in being contacted" with "save my own calculation," which is the same
  register-interest-vs-save conflation standing instruction already prohibits for this project.
- **`pilot_registrations`** / **`otp_challenges`**: scoped entirely to phone-identity verification for
  the (currently disabled) 1.1B pilot — no relation to calculation snapshots, inputs, or results at all.

Neither can be extended without breaking its existing, documented purpose or an existing constraint.
**A new table is a checked conclusion, not a default.** `saved_borrow_checks` below is sized to hold
exactly what's needed and is intentionally shaped so R1 can reuse it later by widening its
`situation_key` CHECK constraint, rather than requiring a second new table.

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
verified) and durable across devices in a way an inbox-bound link partly is too — but genuinely
contingent on things outside this spec's control, made concrete by this round's Milestone 2A assessment
(`docs/execution/TWILIO_PILOT_SMS.md`), not just restated governance: enabling 1.1B in production, which
current governance explicitly prohibits until separately changed; the still-open money/loan
content-restriction question (Twilio's India guidelines name this category specifically; not resolved
by reasoning alone, only by Twilio's written answer); and, independent of Twilio, **today's phone
numbers are stored in plain text with no encryption, no retention/purge job, and no deletion or
withdrawal path** (confirmed this round). Attaching a new feature's data to that storage before those
gaps are addressed would extend a known weakness rather than work around it.

**Why mobile would still be useful, if these were resolved**: a verified phone number is a stronger,
device-independent identity than an email link — it survives a visitor switching or losing access to
an email inbox, and a verified number is reusable for future features (e.g. a status update) without
re-verifying. That's a real advantage, not a non-reason — it's just not available at acceptable risk
today.

**Recommendation: Option A for v1; defer phone capture rather than build it now.** Mobile adds cost and
unresolved risk (open compliance question, no encryption/retention/deletion controls) without a
demonstrated customer need that email can't meet for this use case — saving your own calculation is not
an irreversible or high-stakes action, so the weaker identity guarantee email gives is proportionate.
This is "the smallest useful service": build what's needed now (email), not what might be useful later
(phone), and revisit phone once the Milestone 2A gaps are actually closed and a real customer need for
cross-device durable identity is shown, not assumed. The Twilio assessment itself continues regardless
of this deferral — see `docs/execution/TWILIO_PILOT_SMS.md`, which this document does not block or
depend on.

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
