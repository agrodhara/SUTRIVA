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
`revolving_balance`, and `annual_interest_rate_percent`.

Reward input supports both legacy and extended forms:
- Legacy compatibility: `estimated_reward_rate_percent`.
- Cashback amount mode: `reward_type=cashback`,
  `reward_input_basis=cashback_amount`, `cashback_amount`, `reward_period`.
- Known reward value mode: `reward_type=points|miles`,
    `reward_input_basis=known_reward_value`, `reward_value_amount`,
    `reward_period`.
- Points/miles mode: `reward_type=points|miles`,
  `reward_input_basis=earned_units`, `reward_units_earned`, `reward_period`,
  and either `rupee_value_per_reward_unit` or `reward_value_unknown=true`.
- Unknown mode: `reward_type=not_sure` sets an explicit unknown-value outcome.

Interest input supports additive completeness fields:
- `interest_input_basis=no_balance` for confirmed no carried balance.
- `interest_input_basis=known` with `revolving_balance` and
    `annual_interest_rate_percent`.
- `interest_input_basis=unknown` with `interest_value_unknown=true`.

The response includes `policy_version=alpha50-money-value-v0.1`,
`reward_type`, `reward_input_basis`, `reward_period`, `annual_spend`,
`estimated_annual_rewards`, `annual_card_fee`,
`interest_input_basis`, `interest_value_known`,
`estimated_annual_interest_cost`, `estimated_net_annual_value`,
`reward_value_known`, optional `unknown_value_reason`, `value_status`,
`reason_codes`, `next_best_action`, `guidance_disclaimer`, and `audit_event_id`.

## Compatibility routes

`POST /v1/borrow-better/quick-check` and
`POST /v1/money-value/quick-check` remain available for compatibility and
delegate to the shared backend services. The PWA does not call them.

## Product events

`POST /v1/events` accepts only `event_type`, `journey`, and
`decision_context`, plus optional Track 1.1 fields `intent` and `reason`
for selected event types. Supported events are `door_selected`,
`check_started`, `check_completed`, `what_if_started`, `what_if_completed`,
`teaser_viewed`, `teaser_cta_selected`, `next_interest_viewed`,
`next_interest_selected`, `next_interest_skipped`, `go_deeper_selected`,
`go_deeper_declined`, and `decline_reason_selected`.
The server adds `event_id` and `created_at`; no PII or financial values are
accepted.

## Alpha boundaries

All calculations and thresholds remain backend-owned. These APIs provide
indicative guidance only and do not provide lender offers, ranking, approval,
fulfilment, Account Aggregator, bureau, login, OTP, PAN, Aadhaar, or
statement-upload flows.
