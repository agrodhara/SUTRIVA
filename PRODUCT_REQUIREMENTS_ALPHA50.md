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

## Required controls

- Every policy has version.
- Every result has reason codes.
- Every decision is auditable.
- Every real-data expansion requires gate approval.
