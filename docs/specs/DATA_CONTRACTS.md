# Data Contracts — Alpha-50

## Shared audit event

Every quick-check call appends one local JSONL event through the single shared
`record_audit_event` implementation. The path is `AUDIT_LOG_PATH` or
`./audit_events.jsonl`.

```json
{
  "audit_event_id": "uuid",
  "event_type": "money_value_check",
  "created_at": "2026-09-08T00:00:00Z",
  "event_time_utc": "2026-09-08T00:00:00Z",
  "policy_version": "alpha50-money-value-v0.1",
  "decision_context": "local_demo",
  "input_snapshot": {},
  "output_snapshot": {}
}
```

The same structure is used for `comfortable_borrowing_check` and legacy
compatibility checks. Responses expose `audit_event_id` and the structured
event.

## Borrowing policy

The shared decision engine loads `borrow_better_v0_1.json` and evaluates five
rules: `FOIR_HIGH`, `BUFFER_LOW`, `INCOME_UNVERIFIED`,
`COMMITMENT_RATIO_CAUTION`, and `NEGATIVE_SURPLUS`.

### Borrow Better 1.1A calculation

The illustrative annual rate is policy-configured and read-only; it is not a
customer input (see the rate policy in `API_SPEC.md`). All values below are
computed by the backend from that rate.

- Monthly rate `r = annual_rate / 12`. EMI = `P·r·(1+r)^n / ((1+r)^n − 1)`, or
  `P / n` when the rate is zero.
- `debt_ratio_before = existing_debt_payments / monthly_income`;
  `debt_ratio_after = (existing_debt_payments + EMI) / monthly_income`. Only debt
  payments are in the numerator.
- `committed_ratio_*` add the essentials (`non_debt_commitments`) to the
  numerator. The essentials also feed `breathing_room_*` and the `BUFFER_LOW` and
  `NEGATIVE_SURPLUS` rules.
- `breathing_room_before = monthly_income − existing_debt_payments − non_debt_commitments`;
  `breathing_room_after = breathing_room_before − EMI`. Negative values are valid
  and are not clamped.
- `total_repayment = EMI × n` (unrounded EMI); `total_interest = total_repayment − principal`.
- `main_pressure.monthly_amount` is the EMI. `loan_reduction_nudge` is
  `EMI(P) − EMI(P − 100000)` at the same rate and tenure, and is absent when
  `P ≤ 100000`.

`month_end_position`, `loan_purpose` and `existing_emi_ending_within_six_months`
are declared context only. They never change these figures and never make a
lending decision. They are not persisted in product events or
anonymous-continuity tables, and audit snapshots record only which structured
fields were declared, never their values.

Reference case (income 1,20,000; debt payments 18,000; essentials 28,000, 11,000,
12,000, 6,000; ₹5,00,000 over 36 months at 14%): EMI 17,088.81; debt ratio 0.15 →
0.2924; breathing room 45,000.00 → 27,911.19; total repayment 6,15,197.34; total
interest 1,15,197.34; nudge 3,417.76. The journey displays these rounded (EMI and
breathing room to the nearest ₹100, ratios to a whole percent, totals in lakh).

## Money Value policy

The dedicated backend service uses `alpha50-money-value-v0.1`. It calculates
annual spend, rewards, annualized interest cost, and net annual value from
user-declared estimates.

Supported reward inputs:
- `estimated_reward_rate_percent` (legacy compatibility).
- Cashback amount mode with period (`cashback_amount` and `reward_period`).
- Known reward value mode for points/miles (`reward_value_amount` and
  `reward_period` with `reward_input_basis=known_reward_value`).
- Points/miles mode with period and optional rupee conversion
  (`reward_units_earned`, `reward_period`, `rupee_value_per_reward_unit`).
- Unknown-value mode (`reward_type=not_sure` or `reward_value_unknown=true`).

Interest completeness (additive and backward-compatible):
- `interest_input_basis=no_balance` for confirmed no carried balance.
- `interest_input_basis=known` for known carried balance inputs.
- `interest_input_basis=unknown` with `interest_value_unknown=true`.

Output status can be `POSITIVE`, `NEUTRAL`, `VALUE_LEAKAGE`, or
`UNKNOWN_VALUE`. Unknown value is explicit and does not coerce rewards or net
value to zero.

Rewards Intelligence 1.1A additions (optional and backward-compatible):
- `spending_priorities` (one to three unique allowlisted categories) and
  `balance_behavior` (`pay_in_full`, `carry_balance`, `not_sure`) are accepted
  on the request. `carry_balance` and `not_sure` produce an explicit unknown
  interest effect, so `estimated_net_annual_value` is `null` rather than a
  figure that ignores interest.
- The response adds only echoed non-financial inputs and bounded codes
  (`spending_fit_status`, `main_pressure_code`, `nudge_code`).
- Unknown request fields are rejected.
- Priorities and balance behaviour are transient. They are not written to the
  audit log, the anonymous-continuity tables or product events. Audit
  snapshots use fixed allow-listed keys, and none of them include these fields.

## Product event

```json
{
  "status": "persisted",
  "event_id": "uuid",
  "event_type": "next_interest_selected",
  "received_at": "2026-09-08T00:00:00Z",
  "journey": "money_value",
  "decision_context": "local_demo",
  "intent": "actual_card_value",
  "reason": null,
  "screen_name": null
}
```

Product events are persisted in PostgreSQL with anonymous-session-scoped
idempotency on `(anonymous_session_uuid, event_id)`. The browser never chooses
or persists the server session UUID.

Stored allowlist:
- `event_id`
- `event_type`
- `journey_run_id` mapped to a server-bound journey run
- `journey`
- `version`
- `decision_context`
- optional `card_check_number`
- optional first/latest-touch UTM attribution fields with strict validation
- optional continuation `intent` and `reason`
- optional categorical `screen_name` (see below)
- `client_occurred_at`, clamped `effective_occurred_at`, and server
  `received_at`

Explicitly prohibited from persistence:
- income, spend, debt, commitments, loan amount, balances, rates,
  rewards values, or calculated currency outputs
- complete request or response bodies
- phone, email, OTP, consent, contact, or identity data
- raw cookie values, raw tokens, digests rendered into logs, arbitrary event
  properties, or browser fingerprint data

Contract rules:
- View and start/completion events do not carry `intent` or `reason`.
- `next_interest_selected` requires `intent`.
- `decline_reason_selected` requires both `intent` and `reason`.
- Intent and reason values are restricted by journey.
- Unknown or unapproved top-level and nested fields are rejected.

### `screen_name`

`screen_name` identifies which final 1.1A journey screen an event belongs to. It
is categorical only and is validated against this allowlist, with no other value
accepted:

- Rewards (`journey=money_value`): `rewards_card_behaviour`,
  `rewards_priorities_inputs`, `rewards_check`, `rewards_connected_example`
- Borrow Better (`journey=comfortable_borrowing`): `borrow_monthly_position`,
  `borrow_plan`, `borrow_check`, `borrow_connected_example`

Per-event-type rules and the journey pairing are in `docs/specs/API_SPEC.md`.

Persistence: a nullable `product_events.screen_name` column, `varchar(32)`,
added by migration `0003_product_event_screen_name`. The database check
constraint `ck_product_events_screen_name` allows `NULL` or exactly one of the
eight values. Rows written before the migration keep `NULL`. There is no index
on the column. Idempotency, session ownership, retention timestamps and foreign
keys are unchanged.

Privacy: `screen_name` must never carry financial values, rates, balances, PII,
OTPs, free text or other user-entered content. It is not written to application
logs, and it does not appear in audit snapshots.

## Sensitive-data rule

Do not collect or log names, phone numbers, email, PAN, Aadhaar, account or
card numbers, bureau data, raw statements, IP/device fingerprints, or
secrets.
