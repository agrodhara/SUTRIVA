# API Specification — Alpha-50

Base URL: `http://127.0.0.1:8000`

## Foundation

`GET /health` returns the service status. The PWA uses
`NEXT_PUBLIC_API_BASE_URL` for all calls.

`POST /v1/anonymous-sessions/bootstrap` creates or continues the anonymous
browser session. Requests must come from an exact allowed `Origin` and use
credentialed cookies. The server sets a host-only `HttpOnly` cookie with
`Secure`, `SameSite=Lax`, `Path=/`, and `Max-Age=7776000` in production.

Phase B exposes no browser-accessible anonymous-session rotation endpoint.
Token rotation exists only as an internal server primitive for future
compromise-handling or server-controlled triggers.

Rotation remains dormant in Phase B. Invocation after OTP verification and
history linking is deferred to Track 1.1B, and rotation must not extend the
session's original absolute-expiry boundary.

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

`POST /v1/events` is a cookie-authenticated, exact-origin, credentialed route.
It accepts only allow-listed product-learning fields: `event_id`, `event_type`,
`journey_run_id`, `journey`, `version`, `timestamp`, `decision_context`,
optional `card_check_number`, optional first/latest-touch attribution, and
optional Track 1.1 continuation `intent` and `reason` for selected event types,
and optional categorical `screen_name` for the final 1.1A journeys.

The server derives the anonymous session from the session cookie, persists
session-scoped idempotent product events in PostgreSQL, stores normalized
attribution and continuation-intent rows, and never accepts raw financial
inputs, calculation outputs, PII, arbitrary event properties, or client-chosen
anonymous session identifiers.

### `screen_name` and final-journey events

`screen_name` is a categorical field restricted to eight approved values. Any
other value, including any free text, number or formatted value, returns `422`.

| Journey (`journey`) | Approved `screen_name` values |
|---|---|
| `money_value` (Rewards) | `rewards_card_behaviour`, `rewards_priorities_inputs`, `rewards_check`, `rewards_connected_example` |
| `comfortable_borrowing` (Borrow Better) | `borrow_monthly_position`, `borrow_plan`, `borrow_check`, `borrow_connected_example` |

Two event types are added for the final journeys: `result_declared` and
`connected_example_seen`. All historical event types remain accepted. The final
1.1A journeys must not emit the legacy OTP or consent event types.

| `event_type` | `screen_name` rule |
|---|---|
| `step_viewed`, `step_completed` | Optional, for legacy compatibility. If supplied, one of `rewards_card_behaviour`, `rewards_priorities_inputs`, `borrow_monthly_position`, `borrow_plan`. |
| `result_declared` | Required: `rewards_check` or `borrow_check`. |
| `connected_example_seen` | Required: `rewards_connected_example` or `borrow_connected_example`. |
| Every other event type | Must be absent. |

A `rewards_*` value is valid only with `journey=money_value`, and a `borrow_*`
value only with `journey=comfortable_borrowing`. A cross-journey combination
returns `422`.

Sequence for a final journey: Step 2 or Step 3 opened emits `step_viewed` and
completed emits `step_completed`, each with the step's `screen_name`; Step 4
displayed emits `result_declared` with the check `screen_name`; Step 5 displayed
emits `connected_example_seen` with the connected-example `screen_name`. A
screen emits its event once per actual entry, not on rerender. Journey pages are
not wired to this sequence yet.

The response returns the stored `screen_name` (or `null`). A replayed event
returns the value stored by the first request, and idempotency remains scoped to
the anonymous session and `event_id`.

Status behavior:
- `200` for persisted or idempotently replayed events.
- `202` with `status=accepted_not_persisted` when session validation succeeds
    but non-critical event persistence fails.
- `401` for missing, invalid, expired, or revoked anonymous session cookies.
- `403` for missing or invalid `Origin`.
- `503` when the anonymous session cannot be validated because the database is
    unavailable.

Calculation endpoints do not require anonymous-session authentication and are
not required to send credentialed cookies in Phase B.

## Alpha boundaries

All calculations and thresholds remain backend-owned. These APIs provide
indicative guidance only and do not provide lender offers, ranking, approval,
fulfilment, Account Aggregator, bureau, login, OTP, PAN, Aadhaar, or
statement-upload flows.
