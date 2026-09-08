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
  "disclaimer": "Indicative financial-intelligence output, not a loan offer or approval.",
  "audit_event_id": "0f7c2e5a-6d0a-4e9a-9b1e-1f7f6c3d1a22",
  "audit_event": {
    "event_type": "borrow_better_quick_check",
    "policy_version": "borrow_better_v0_1",
    "decision_context": "local_demo"
  }
}
```

Audit note: every call to this endpoint persists one local JSONL audit event (see `services/audit/README.md`) and returns the generated `audit_event_id`. This is Alpha traceability, not production audit infrastructure.

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
