# Permission records — assessment and proposal (Milestone 2D)

**Nothing in this document is implemented.** It inspects what exists today, proposes the smallest
appropriate extension, and names what's still open for counsel — per the instruction that prompted it.
Related: `docs/execution/TWILIO_PILOT_SMS.md` (the phone/OTP pathway this gap sits in) and
`docs/product/journeys/B1_SAVED_CHECK_SPEC.md` (the saved-check feature this document concludes needs
no new permission record of its own).

## What exists today

The only consent-adjacent field anywhere in this codebase is
`pilot_registrations.optional_updates_opted_in` (migration `0004`, `app/models/pilot.py`'s
`PilotMobileSubmitRequest`): a bare boolean, defaulting to `false`, settable only by an explicit `true`
from the caller — never inferred from submitting a phone number (confirmed in the model's own
docstring and in `tests/test_pilot_registration.py`'s
`test_optional_updates_opted_in_true_on_an_unverified_registration_is_not_a_verified_marketing_consent`).
**This is a real control — it is not nothing** — but it is a single flag, not a permission *record*:

- No `purpose` is stored — the boolean doesn't say what the visitor agreed to be contacted about.
- No `notice_version` is stored — if the notice wording a visitor saw when they checked the box is ever
  revised, there is no way to know which version any given `true` row actually agreed to.
- No `timestamp` separate from the row's own `created_at`/`updated_at` — a later unrelated update to the
  same registration row would not currently disturb this, but the schema doesn't make that explicit or
  protected; nothing stops a future change from doing so by accident.
- It is scoped to exactly one journey (1.1B's phone pilot) — there is no cross-feature concept of a
  permission record at all, so a second feature that ever needs consent (e.g. a future named-partner
  sharing feature) would either reinvent this ad hoc or, worse, be tempted to reuse this exact column for
  a different purpose than it was designed for.

No other table in this codebase records any kind of consent, permission, or notice acknowledgment.
`situation_pilot_interest` and the new `saved_borrow_checks` table (Milestone 2B/C, see
`B1_SAVED_CHECK_SPEC.md`) both deliberately have **no** consent-shaped column at all — checked, not
assumed, by reading both migrations directly.

## Does the new saved-check feature (Milestone 2C) need a permission record?

**No, by the same reasoning this codebase already applies elsewhere.** Requesting an emailed link to
*your own* saved calculation is a service action a visitor directly asked for, not a separate
promotional or third-party use of their email address — the same reasoning that already governs
`situation_pilot_interest` (its own migration states "submitting this form is registering interest in an
invitation, not opting into promotional updates," and the table has no opt-in column at all). Adding a
consent checkbox to the save-check flow would misrepresent what's actually happening (a transactional
email the visitor requested) as if it were a marketing choice, which is the inverse of the naming
discipline this project already holds itself to elsewhere. **No permission record is added or proposed
for the save-check feature itself.**

## Where a real permission record is actually needed

The gap matters for the feature that already has a boolean trying to do a permission record's job:
`optional_updates_opted_in`. It will matter more if phone capture is ever un-deferred (see
`B1_SAVED_CHECK_SPEC.md`'s Option B) or if a future named-partner-sharing feature is built — both would
need a real audit trail, not a bare flag.

## Proposed smallest extension (not implemented)

A small, separate `permission_records` table — not a rename or repurposing of
`optional_updates_opted_in`, which would stay as the fast, denormalized "is this currently true" flag
for query convenience, backed by this table as the audit trail of *why* it's true:

| Column | Notes |
|---|---|
| `permission_record_uuid` | PK |
| `subject_reference` | what the permission is attached to — e.g. `pilot_registration_uuid` today; deliberately a loosely-typed reference (not a hard FK to one single table) so a future feature (e.g. `saved_borrow_checks`, if it ever needs one) can use the same table without a schema change, at the cost of giving up a database-level FK guarantee — worth a second look at actual build time, not decided here. |
| `permission_type` | a bounded `CHECK`-constrained enum: `service`, `marketing`, `named_partner_sharing` — kept as **separate, independent** rows, never one combined flag, per explicit instruction. A visitor can hold any combination, including none beyond the implicit `service` permission every active feature already requires to function at all. |
| `partner_name` | nullable — populated only for a `named_partner_sharing` row, naming exactly which named partner was disclosed and agreed to. **Never a blanket "share with banks/bureaus" row** — each named partner needing its own row is the point, per the explicit "no blanket bank/bureau consent" instruction. |
| `purpose` | free text or a short bounded code describing what the visitor agreed to, shown as part of the same notice they saw. |
| `affirmative_action` | enum, e.g. `checkbox_checked`, `button_clicked` — records that a real, distinct affirmative act occurred, not an inferred default. |
| `notice_version` | a version identifier for the exact notice/copy text in force at the time — so a later wording change doesn't retroactively reinterpret what a past visitor actually agreed to. |
| `granted_at` | timestamp of the affirmative action itself. |
| `withdrawn_at` | nullable — a visitor-initiated withdrawal sets this (never a hard delete of the audit record, which would itself destroy the evidence of what was once agreed to and when it was withdrawn) — withdrawal UI and data-deletion are two different things, and this table is explicitly the audit trail, not the personal data itself. |

**Deliberately excluded from this proposal**: no column anywhere on this table or elsewhere infers
"agreed to share with banks/bureaus generally" from any neutral action. Any named-partner sharing
permission requires its own `permission_type = 'named_partner_sharing'` row with an explicit
`partner_name`, never a default-on or implied-by-silence state.

## Unresolved questions flagged for counsel — not resolved here

Per explicit instruction not to guess at these:

- **Notice wording**: what the actual notice text should say for each `permission_type`, and whether a
  single shared notice can cover `service` + `marketing` or whether they need visually and legally
  distinct presentation — a legal/product wording question, not an engineering one.
- **Entity**: which legal entity is the data controller/processor of record for these permissions (the
  operating company name, not assumed from anything in this repository).
- **Storage location**: whether any data-residency requirement constrains where this table (or the
  underlying phone/email data it's attached to) may be hosted — not addressed by this document, and not
  something to infer from the Lightsail/AWS region already in use for unrelated reasons.
- **Retention**: how long a *withdrawn* or *expired* permission record itself must be kept (as distinct
  from the personal data it was attached to, which has its own retention question — see
  `TWILIO_PILOT_SMS.md`'s phone-number findings) — a regulatory question, not inferred here.
- **Jurisdiction**: which jurisdiction's rules actually govern this (data protection law, consent
  requirements, etc.) is explicitly **not inferred from where the founder lives** — this document takes
  no position on jurisdiction at all, and flags that someone with the relevant facts (where visitors
  are, where the entity is registered, where data is hosted) needs to answer it before any of the above
  can be finalized.

## Status

**Proposed only.** No migration, no code, no new consent UI. `optional_updates_opted_in` continues to
function exactly as it does today; nothing in this document changes its behavior. This is scoped as a
design proposal for whoever owns the next phone-capture or named-partner-sharing decision, not as
something this Milestone's other work (Parts A–C) depends on or is blocked by.
