# API Specification — Alpha-50 Draft

Base URL local: `http://127.0.0.1:8000`

## GET /health

Response:

```json
{
  "status": "ok",
  "service": "sutriva-api"
}
```

## POST /borrow-better/quick-check

Purpose: return indicative affordability insight.

Request:

```json
{
  "declared_monthly_income": 150000,
  "existing_monthly_emi": 35000,
  "desired_loan_amount": 800000,
  "tenure_months": 36,
  "indicative_interest_rate_pa": 0.15
}
```

Response:

```json
{
  "journey": "borrow_better",
  "policy_version": "borrow_better_v0_1",
  "status": "CAUTION",
  "comfortable_monthly_emi": 32500,
  "comfortable_borrowing_range": {
    "lower": 550000,
    "upper": 700000
  },
  "reason_codes": [
    "Existing commitments reduce room for a new EMI",
    "A lower amount may preserve monthly buffer"
  ],
  "disclaimer": "Indicative financial-intelligence output, not a loan offer or approval."
}
```

## POST /v1/financial-intelligence/money-value-check (preferred)

Purpose: Money Value Check — an Alpha-50 diagnostic for Door A (Get More From
My Money). Answers: "Based on how I use this card and what it costs me, am I
actually getting value from it?"

This is the preferred Alpha-50 public endpoint. The legacy internal route
`POST /v1/money-value/quick-check` (see below) is preserved for backwards
compatibility only.

Boundaries: this endpoint returns a financial-intelligence diagnostic only. It
is not a card recommendation, best-card ranking, product marketplace, offer
engine or apply flow, and it must never be presented as one.

Request (user-declared estimates only; no card number, issuer, PAN, customer
ID, phone, email, account number, statement upload or transaction-level data):

```json
{
  "monthly_card_spend": 50000,
  "annual_card_fee": 4000,
  "estimated_reward_rate_percent": 1.5,
  "revolving_balance": 0,
  "annual_interest_rate_percent": 36
}
```

Fields (all must be `>= 0`; negative values return HTTP 422):

- `monthly_card_spend` (required): approximate monthly spend on the card.
- `annual_card_fee` (required): annual fee paid by the user.
- `estimated_reward_rate_percent` (required): rough effective reward/cashback
  value as a percentage of spend.
- `revolving_balance` (optional, default 0): approximate unpaid/revolving card
  balance.
- `annual_interest_rate_percent` (optional, default 0): estimated annual
  interest rate on the revolving balance.

Response:

```json
{
  "policy_version": "alpha50-money-value-v0.1",
  "annual_spend": 600000,
  "estimated_annual_rewards": 9000,
  "annual_card_fee": 4000,
  "estimated_annual_interest_cost": 0,
  "estimated_net_annual_value": 5000,
  "value_status": "POSITIVE",
  "reason_codes": ["NET_VALUE_POSITIVE"],
  "next_best_action": "You appear to be getting positive annual value from this card. Keep monitoring fees, reward usage, and whether you revolve balances.",
  "guidance_disclaimer": "This is an indicative money-value estimate based on the information provided. It is not a card recommendation, product offer, or financial advice.",
  "audit_event_id": "uuid-string",
  "audit_event": {
    "event_type": "money_value_check",
    "policy_version": "alpha50-money-value-v0.1",
    "decision_context": "local_demo"
  }
}
```

Calculation logic (backend owns all calculations; monetary outputs are rounded
to two decimals):

- `annual_spend = monthly_card_spend * 12`
- `estimated_annual_rewards = annual_spend * (estimated_reward_rate_percent / 100)`
- `estimated_annual_interest_cost = revolving_balance * (annual_interest_rate_percent / 100)`
  — deliberately simple annualized estimate, not a billing-system calculation.
- `estimated_net_annual_value = estimated_annual_rewards - annual_card_fee - estimated_annual_interest_cost`

Value-status thresholds (placeholder Alpha-50 thresholds, not financial-advice
standards):

- `POSITIVE`: `estimated_net_annual_value > 1000`
- `NEUTRAL`: `-1000 <= estimated_net_annual_value <= 1000`
- `VALUE_LEAKAGE`: `estimated_net_annual_value < -1000`

Deterministic reason codes:

- `NET_VALUE_POSITIVE` / `NET_VALUE_NEUTRAL` / `NET_VALUE_NEGATIVE`: net-value
  band of the result.
- `ANNUAL_FEE_DRAG`: the annual fee materially reduces value (fee > 0 and fee
  meets or exceeds estimated annual rewards).
- `REVOLVING_INTEREST_DRAG`: estimated revolving interest cost is > 0.
- `LOW_REWARD_CAPTURE`: effective reward rate is very low (< 0.5%).

Audit: every check appends one JSONL audit event (`money_value_check`) with
`audit_event_id`, `created_at`, `policy_version`, `decision_context`,
`input_snapshot` and `output_snapshot`. Sensitive fields (name, email, phone,
PAN, card number, account number, raw transaction data, issuer account IDs)
are never logged.

## POST /v1/money-value/quick-check (legacy, internal)

Purpose: return indicative value-leakage estimate.

Deprecated legacy route retained for backwards compatibility. Prefer
`POST /v1/financial-intelligence/money-value-check` for all Alpha-50 work.

Request:

```json
{
  "monthly_card_spend": 100000,
  "annual_card_fee": 5000,
  "monthly_interest_or_late_fee": 1500,
  "estimated_reward_rate": 0.01,
  "subscription_leakage_monthly": 800
}
```

Response:

```json
{
  "journey": "money_value",
  "policy_version": "money_value_v0_1",
  "estimated_annual_value_gap": 23600,
  "reason_codes": [
    "Annual fee and recurring charges reduce net value",
    "Reward rate may not offset current leakage"
  ],
  "disclaimer": "Indicative estimate based on user-declared inputs."
}
```

## Error shape

```json
{
  "error": "INVALID_INPUT",
  "message": "declared_monthly_income must be greater than zero"
}
```

## API rule

APIs return insight and reason codes. They do not return loan offers, lender rankings or approval promises in Alpha.
