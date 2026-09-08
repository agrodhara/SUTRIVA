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

## POST /money-value/quick-check

Purpose: return indicative value-leakage estimate.

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

## POST /v1/events

Purpose: record a minimal local product-learning event. Not analytics, not
financial data.

Request:

```json
{
  "event_type": "door_selected",
  "journey": "money_value",
  "decision_context": "local_demo"
}
```

`event_type` must be one of: `door_selected`, `check_started`, `check_completed`,
`go_deeper_selected`, `go_deeper_declined`.

`journey` must be one of: `money_value`, `comfortable_borrowing`.

Response:

```json
{
  "event_id": "uuid",
  "event_type": "door_selected",
  "created_at": "2026-09-08T00:00:00Z",
  "journey": "money_value",
  "decision_context": "local_demo"
}
```
