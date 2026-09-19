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
- Audit log for decision outputs (local JSONL, returns `audit_event_id`; see `services/audit/README.md`).
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

#### Money Value Check (Vertical Slice 4)

- Preferred public endpoint: `POST /v1/financial-intelligence/money-value-check`.
  The legacy internal route `POST /v1/money-value/quick-check` is preserved but
  no longer preferred.
- Question answered: "Based on how I use this card and what it costs me, am I
  actually getting value from it?"
- Inputs (user-declared estimates, all `>= 0`): `monthly_card_spend`,
  `annual_card_fee`, `estimated_reward_rate_percent`, `revolving_balance`
  (default 0), `annual_interest_rate_percent` (default 0).
- Calculation (backend only):
  `annual_spend = monthly_card_spend * 12`;
  `estimated_annual_rewards = annual_spend * estimated_reward_rate_percent / 100`;
  `estimated_annual_interest_cost = revolving_balance * annual_interest_rate_percent / 100`
  (simple annualized estimate, not a billing-system calculation);
  `estimated_net_annual_value = rewards - fee - interest`. Monetary outputs are
  rounded to two decimals.
- Value status uses placeholder Alpha-50 thresholds (not financial-advice
  standards): `POSITIVE` if net value > 1000, `NEUTRAL` if within +/-1000,
  `VALUE_LEAKAGE` if below -1000.
- Deterministic reason codes: `NET_VALUE_POSITIVE`, `NET_VALUE_NEUTRAL`,
  `NET_VALUE_NEGATIVE`, `ANNUAL_FEE_DRAG`, `REVOLVING_INTEREST_DRAG`,
  `LOW_REWARD_CAPTURE`.
- Every check is persisted via the shared audit service as a
  `money_value_check` JSONL event with `audit_event_id` and
  `decision_context = local_demo`.
- Indicative-only limitation: outputs are estimates from user-declared inputs;
  they are not a card recommendation, product offer or financial advice.
- Hard boundary: no best-card recommendation, product ranking, card
  marketplace, affiliate links, offers or apply flow. The user is checking
  financial value and leakage, not shopping for a card.

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

The preferred route is `POST /v1/borrowing-intelligence/comfortable-borrowing-check`.
It uses the shared affordability layer and `borrow_better_v0_1.json`; the
frontend does not calculate thresholds. The five policy rules are
`FOIR_HIGH`, `BUFFER_LOW`, `INCOME_UNVERIFIED`, `COMMITMENT_RATIO_CAUTION`, and
`NEGATIVE_SURPLUS`.

The Alpha journey has exactly two doors. Go Deeper appears only after a
successful quick check, records interest-only intent, collects no additional
financial data, and sends “Not now” back to the originating journey.

Product events are limited to `event_id`, `event_type`, `created_at`, `journey`,
and `decision_context`; no PII or financial values are included.

## Required controls

- Every policy has version.
- Every result has reason codes.
- Every decision is auditable. Each quick-check call persists a local JSONL audit event and returns its `audit_event_id` in the API response for traceability. This is Alpha-local audit trail, not production audit infrastructure.
- Every real-data expansion requires gate approval.
