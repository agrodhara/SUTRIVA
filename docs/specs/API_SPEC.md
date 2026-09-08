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

## POST /v1/borrowing-intelligence/comfortable-borrowing-check

Comfortable Borrowing Check is guidance only. It is not a loan approval, eligibility
decision, lender offer, marketplace, or application flow.

Request:

```json
{
  "monthly_income": 100000,
  "existing_monthly_commitments": 25000,
  "desired_borrowing_amount": 500000,
  "desired_tenure_months": 36
}
```

The Alpha placeholder interest assumption is an annual rate of `0.12`, with the
standard EMI formula and a monthly rate of `annual_interest_rate / 12`. Monetary
outputs are rounded to two decimals.

Response:

```json
{
  "estimated_new_monthly_commitment": 16607.62,
  "total_monthly_commitment": 41607.62,
  "commitment_ratio": 0.4161,
  "comfort_status": "CAUTION",
  "reason_codes": ["COMMITMENT_RATIO_CAUTION"],
  "next_best_action": "Your monthly commitments may still be manageable, but keep a buffer before taking on this amount.",
  "policy_version": "alpha50-comfort-v0.1",
  "guidance_disclaimer": "This is a financial comfort estimate, not a loan approval, eligibility decision, lender offer, or credit recommendation.",
  "audit_event": {
    "event_type": "comfortable_borrowing_check",
    "policy_version": "alpha50-comfort-v0.1",
    "decision_context": "local_demo"
  }
}
```

Comfort status uses placeholder Alpha-50 thresholds: `COMFORTABLE` at or below
`0.35`, `CAUTION` above `0.35` through `0.50`, and `STRETCHED` above `0.50`.
The deterministic reason codes are `COMMITMENT_RATIO_COMFORTABLE`,
`COMMITMENT_RATIO_CAUTION`, and `COMMITMENT_RATIO_STRETCHED`. `audit_event` is a
local-demo stub and is not persistence.
