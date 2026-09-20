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
  "reason": null
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

## Sensitive-data rule

Do not collect or log names, phone numbers, email, PAN, Aadhaar, account or
card numbers, bureau data, raw statements, IP/device fingerprints, or
secrets.
