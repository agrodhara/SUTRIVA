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

## Does the new saved-check feature (Milestone 2C) need a permission record? — corrected this round

**An earlier version of this section concluded, categorically, "No ... no permission record is added or
proposed for the save-check feature itself." That conclusion is withdrawn here as overstated.** It
conflated four distinct things that need to be looked at separately, and it stated a legal-sounding
conclusion ("this needs no consent") that this document is not positioned to make. Each is addressed on
its own below, rather than collapsed into one yes/no:

**1. The requested service action itself.** A visitor asking to be emailed a link to their own saved
result is, as an engineering/product judgment, not an action that resembles marketing or third-party
sharing — this part of the original reasoning is unchanged, and matches the precedent
`situation_pilot_interest` already sets. This is a judgment about what *kind* of action it is, not a
legal determination that no consent mechanism is required under any specific law — see point 5.

**2. Notice/request evidence.** **Now implemented**, not merely proposed: `saved_borrow_checks.notice_version`
(migration `0009_saved_check_notice_version`, added this round — see
`docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md`) records which exact notice-copy version was shown at the
moment of each save request. This is evidence of *what was requested and under what stated terms*, kept
distinct from a consent record (point 3) precisely because a requested service action still deserves a
record of what the visitor was told, even where no separate consent mechanism applies.

**3. Marketing permission.** Does not apply to this feature at all — the save-check flow has no marketing
content, no opt-in checkbox, and sends exactly one transactional email per save. Stated as "not
applicable here," not folded into point 1's reasoning.

**4. Any future named-partner-sharing permission.** Also does not apply — this feature shares data with no
third party, named or otherwise. Not addressed further here; see the proposed `permission_records` table
below, which is where a future feature that *does* need this would record it, with no blanket consent row
ever implied by this feature's existence.

**5. The unresolved legal-basis decision — flagged, not resolved.** Whether a requested service action
like this one needs an explicit consent mechanism, or can instead rely on another legal basis (e.g.
something like contract-necessity or legitimate-interest reasoning, depending on which jurisdiction's law
actually applies), **is a legal question this document does not and cannot answer**. Point 1's engineering
judgment is not a substitute for that determination, and should not be read as one. This is added to the
"flagged for counsel" list below, not resolved by inference here.

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

- **Legal basis for the save-check service action** (new this round): whether requesting an emailed link
  to one's own saved result needs an explicit consent mechanism under whichever law actually applies, or
  can rely on a different legal basis — this document's "it's a requested service action" framing is a
  product/engineering judgment about what kind of action this is, not a legal conclusion, and is not
  sufficient on its own to settle this question. Flagged for counsel, not decided here.
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

**Mostly proposed, one piece now implemented.** The `permission_records` table above remains proposed
only — no migration, no code, no new consent UI, and `optional_updates_opted_in` continues to function
exactly as it does today. The one exception: `saved_borrow_checks.notice_version` (point 2 above) is real,
shipped, and tested this round — request evidence, not a consent record. The categorical "no permission
record needed" conclusion this document previously stated has been withdrawn and replaced with the
four-way separation above, and the legal-basis question is now explicitly flagged for counsel rather than
answered by engineering judgment. This remains a design proposal for whoever owns the next phone-capture
or named-partner-sharing decision; it is not something this Milestone's other work depends on or is
blocked by.
