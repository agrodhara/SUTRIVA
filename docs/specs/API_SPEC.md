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

Two request modes share this route. `calculation_mode` is inferred when omitted
and the request is unambiguous.

- `legacy_total_commitments` (Track 1.0): `monthly_income`,
  `existing_monthly_commitments`, `desired_borrowing_amount`,
  `desired_tenure_months`.
- `track_11a_breakdown` (final 1.1A journey): `monthly_income`,
  `existing_debt_payments`, the four essentials `housing_rent`,
  `household_utilities`, `dependants_education`,
  `recurring_medical_insurance`, `desired_borrowing_amount`,
  `desired_tenure_months`. The legacy `other_essential_commitments` is optional
  (absent means 0); the final journey does not collect it.

Validation: `monthly_income` and `desired_borrowing_amount` must be above zero;
payments and essentials must be zero or more, and a confirmed zero is valid.
A missing or `null` required field is `422`; blank is never coerced to zero.
`desired_tenure_months` is 1–360 (the final journey offers 12, 24, 36, 48, 60).
Unsupported request fields are rejected with `422` rather than dropped.

Additive optional declared context: `month_end_position`
(`money_left`, `break_even`, `fall_short`, `not_sure`), `loan_purpose`
(`home_improvement`, `education`, `medical`, `debt_consolidation`, `vehicle`,
`household_purchase`, `other`; enum only, no free text) and
`existing_emi_ending_within_six_months` (`yes`, `no`, `not_sure`). None of these
changes the numeric affordability calculation, and they are not written to
product events, anonymous-continuity tables or audit snapshots.

**Rate policy.** The annual rate is configured by policy
(`borrowIllustrativeAnnualRatePercent` in `shared/track11_config.json`) and is
display-only; customers cannot change it. `illustrative_annual_rate_percent` is
optional in the request: omitted is accepted and the configured rate is used, a
value exactly equal to the configured rate is accepted, and any other value is
`422`. A mismatched client rate is never used in a calculation. This supersedes
the earlier behaviour in which a client-supplied rate was honoured.

The response includes `policy_version=borrow_better_v0_1`,
`illustrative_annual_rate_percent` (the effective configured rate),
`existing_debt_payments`, `non_debt_commitments`,
`estimated_new_monthly_commitment` (the EMI), `total_monthly_commitment`,
`commitment_ratio`, `debt_ratio_before`, `debt_ratio_after`,
`committed_ratio_before`, `committed_ratio_after`, `breathing_room_before`,
`breathing_room_after`, `total_repayment`, `total_interest`, `comfort_status`,
`reason_codes`, `next_best_action`, `guidance_disclaimer`, and `audit_event_id`.
Values are exact (2 decimals for money, 4 for ratios); display rounding is the
client's concern. Negative `breathing_room_after` is returned as is, never
clamped.

Additive final-journey fields, all computed by the backend:

- `main_pressure`: `{ code: "PROPOSED_EMI_REDUCES_BREATHING_ROOM", monthly_amount }`,
  where `monthly_amount` is the EMI.
- `loan_reduction_nudge`: `{ reduction_amount: 100000, monthly_breathing_room_preserved }`,
  the EMI difference between the requested amount and an amount exactly ₹1 lakh
  lower at the same rate and tenure. `null` when the requested amount is
  ₹1 lakh or less.
- `reconciliation_note`: `MONTH_END_FALL_SHORT` or `MONTH_END_POSITION_UNKNOWN`,
  else `null`. Informational only; it does not feed the decision engine.
- `emi_ending_note`: `EMI_MAY_END_WITHIN_SIX_MONTHS` when the answer was `yes`,
  else `null`. Informational only.

### `POST /v1/borrowing-intelligence/emi-preview`

Lightweight EMI preview for the plan step. Request: `desired_borrowing_amount`
(above zero) and `desired_tenure_months` (1–360). There is no rate field, and any
other field is `422`. The response is `illustrative_annual_rate_percent` (the
configured rate), `estimated_monthly_emi` and `guidance_disclaimer` (a fixed
non-offer statement). It uses the same EMI function as the full check, records no
audit event and no product event, and persists and logs nothing from the request.

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

Rewards Intelligence 1.1A additive request fields (both optional; older callers
omit them):
- `spending_priorities`: one to three unique values from `dining`, `travel`,
  `grocery`, `everyday_bills`. Used only to echo the selection and set the
  spending-fit status. Never persisted or audited.
- `balance_behavior`: `pay_in_full`, `carry_balance` or `not_sure`.
  `pay_in_full` resolves to `interest_input_basis=no_balance`. `carry_balance`
  and `not_sure` resolve to `interest_input_basis=unknown` unless
  `carry_balance` is sent with a known balance and rate. No interest cost is
  ever invented. Conflicting interest inputs return `422`.

The request rejects unknown fields with `422` instead of ignoring them.

The response includes `policy_version=alpha50-money-value-v0.1`,
`reward_type`, `reward_input_basis`, `reward_period`, `annual_spend`,
`estimated_annual_rewards`, `annual_card_fee`,
`interest_input_basis`, `interest_value_known`,
`estimated_annual_interest_cost`, `estimated_net_annual_value`,
`reward_value_known`, optional `unknown_value_reason`, `value_status`,
`reason_codes`, `next_best_action`, `guidance_disclaimer`, and `audit_event_id`.

Additive Step 4 fields. They are bounded codes and echoed non-financial inputs,
never generated prose:
- `reward_amount_per_period`: the rupee cashback or known reward value the
  customer entered, or `null`.
- `reward_units_per_period`: the points or miles quantity entered on the
  quantity-only path, or `null`.
- `spending_priorities`: the echoed selection, or `null`.
- `spending_fit_status`: `CATEGORY_FIT_UNDETERMINED` when priorities were sent,
  otherwise `NOT_PROVIDED`. The card's category earning structure is not
  collected, so category fit is never determined and no card is recommended.
- `main_pressure_code`, with this precedence: `REWARD_VALUE_UNKNOWN`,
  `INTEREST_EFFECT_UNKNOWN`, `FEE_EXCEEDS_REWARDS` (fee greater than estimated
  annual rewards), `FEE_REDUCES_VALUE` (any positive fee), `NO_FEE_PRESSURE`.
- `nudge_code`: `COMPARE_REWARDS_FEE_INTEREST`.

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
