# API Specification — Alpha-50

Base URL: `http://127.0.0.1:8000`

## Foundation

`GET /health` returns the service status. The PWA uses
`NEXT_PUBLIC_API_BASE_URL` for all calls.

## Preferred quick-check routes

### `POST /v1/borrowing-intelligence/comfortable-borrowing-check`

Request fields: `monthly_income`, `existing_monthly_commitments`,
`desired_borrowing_amount`, and `desired_tenure_months`.

The response includes `policy_version=borrow_better_v0_1`,
`estimated_new_monthly_commitment`, `total_monthly_commitment`,
`commitment_ratio`, `comfort_status`, `reason_codes`, `next_best_action`,
`guidance_disclaimer`, and `audit_event_id`.

### `POST /v1/financial-intelligence/money-value-check`

Request fields: `monthly_card_spend`, `annual_card_fee`,
`estimated_reward_rate_percent`, `revolving_balance`, and
`annual_interest_rate_percent`.

The response includes `policy_version=alpha50-money-value-v0.1`,
`annual_spend`, estimated rewards, annual fee, estimated interest cost,
estimated net annual value, `value_status`, `reason_codes`,
`next_best_action`, `guidance_disclaimer`, and `audit_event_id`.

## Compatibility routes

`POST /v1/borrow-better/quick-check` and
`POST /v1/money-value/quick-check` remain available for compatibility and
delegate to the shared backend services. The PWA does not call them.

## Product events

`POST /v1/events` accepts only `event_type`, `journey`, and
`decision_context`. Supported events are `door_selected`, `check_started`,
`check_completed`, `go_deeper_selected`, and `go_deeper_declined`.
The server adds `event_id` and `created_at`; no PII or financial values are
accepted.

## Alpha boundaries

All calculations and thresholds remain backend-owned. These APIs provide
indicative guidance only and do not provide lender offers, ranking, approval,
fulfilment, Account Aggregator, bureau, login, OTP, PAN, Aadhaar, or
statement-upload flows.
