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

## POST /v1/borrowing-intelligence/comfortable-borrowing-check (preferred, Alpha-50)

Purpose: return indicative Comfortable Borrowing Check guidance. This is the preferred public Borrowing Intelligence endpoint for Alpha-50 and the one the PWA calls.

Request:

```json
{
  "monthly_income": 100000,
  "existing_monthly_commitments": 25000,
  "desired_borrowing_amount": 500000,
  "desired_tenure_months": 36
}
```

Response:

```json
{
  "policy_version": "borrow_better_v0_1",
  "estimated_new_monthly_commitment": 17088.81,
  "total_monthly_commitment": 42088.81,
  "commitment_ratio": 0.4209,
  "comfort_status": "CAUTION",
  "reason_codes": ["INCOME_UNVERIFIED", "COMMITMENT_RATIO_CAUTION"],
  "next_best_action": "Income is self-declared or not yet verified, so the result should be treated as indicative. | The commitment ratio after the new EMI is elevated and may reduce monthly flexibility.",
  "guidance_disclaimer": "Indicative financial-intelligence guidance based on supplied inputs. This is not a loan offer, approval, pre-approval, or eligibility decision.",
  "audit_event_id": "0f7c2e5a-6d0a-4e9a-9b1e-1f7f6c3d1a22",
  "audit_event": {
    "event_type": "comfortable_borrowing_check",
    "policy_version": "borrow_better_v0_1",
    "decision_context": "local_demo"
  }
}
```

Audit note: every call to this endpoint persists one local JSONL audit event (see `services/audit/README.md`) and returns the generated `audit_event_id`. This is Alpha traceability, not production audit infrastructure.

This endpoint reuses the same affordability calculation and decision-engine rules as the legacy `/v1/borrow-better/quick-check` route below (no duplicated business logic); it only exposes product-aligned field names.

## POST /v1/borrow-better/quick-check (legacy/internal compatibility)

Purpose: original affordability quick-check route, kept for backward compatibility. New integrations should prefer `/v1/borrowing-intelligence/comfortable-borrowing-check` above.

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
