# Product Requirements — Alpha-50

## Objective

Test whether users understand and trust a financial-intelligence product enough to complete a quick journey and optionally provide deeper data.

## Target users

Controlled Alpha-50 users from warm channels. Optional control cohort: 5–10 zero-cost friends/family/professional users.

## In scope

- Mobile-first PWA.
- Two-door landing page.
- Quick-value flow before registration.
- Borrow Better indicative affordability insight.
- Get More From My Money indicative value-leakage insight.
- Consent screen before deeper data.
- Decision result with reason codes.
- Audit log for decision outputs.
- Synthetic/demo data until real-data gate.

## Out of scope

- Loan marketplace.
- Apply-to-lender.
- Lender ranking.
- Live Account Aggregator.
- Bureau integration.
- SMS/contact/call-log scraping.
- Native mobile app.
- Production learning model.

## Success signals

- User understands the result.
- User finds the insight useful.
- User is willing to share deeper data after quick value.
- Reason codes are explainable.
- No hard-fail governance issue.

## Product journeys

### Door A — Get More From My Money

Input:

- Rough monthly spend.
- Card/fee/interest/subscription assumptions.

Output:

- Indicative value leakage.
- Suggested next check.
- Reason codes.

### Door B — Borrow Better

Input:

- Declared income.
- Existing EMI.
- Desired loan amount.
- Tenure.

Output:

- Indicative comfortable EMI.
- Indicative comfortable borrowing range.
- Status: OK / Caution / Reduce amount / Not comfortable.
- Reason codes.

## Alpha journey (Vertical Slice 5)

Home → choose door (A or B) → complete quick check → receive result → optionally
"Go deeper" → consent-boundary screen → stop.

- Value is always shown before any request for deeper engagement. No registration,
  login or sensitive data is requested before the first useful result.
- "Go deeper" only appears on the result screen after a quick check completes
  successfully.
- `/go-deeper` is a consent boundary, not real data collection. It explains that a
  future deeper view could use additional permissioned information, and explicitly
  states that no additional financial data is collected in this Alpha step.
- The primary action, "I'm interested in deeper insights", records interest only.
  It never requests bank details, card numbers, PAN/Aadhaar, statement uploads,
  Account Aggregator consent, bureau pulls, or lender handoff.
- The secondary action, "Not now", returns the user to the home page.
- Financial Health remains a shared diagnostic layer, not a third acquisition door.

## Product event taxonomy

Minimal local, first-party events for product learning (no third-party analytics):

- `door_selected`
- `check_started`
- `check_completed`
- `go_deeper_selected`
- `go_deeper_declined`

Each event stores only `event_id`, `event_type`, `created_at`, `journey`
(`money_value` or `comfortable_borrowing`) and `decision_context`. No name, phone,
email, IP, account details, card numbers, raw check inputs or device identifiers
are stored.

## Required controls

- Every policy has version.
- Every result has reason codes.
- Every decision is auditable.
- Every real-data expansion requires gate approval.
