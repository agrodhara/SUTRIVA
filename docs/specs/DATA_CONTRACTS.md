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
- Points/miles mode with period and optional rupee conversion
  (`reward_units_earned`, `reward_period`, `rupee_value_per_reward_unit`).
- Unknown-value mode (`reward_type=not_sure` or `reward_value_unknown=true`).

Output status can be `POSITIVE`, `NEUTRAL`, `VALUE_LEAKAGE`, or
`UNKNOWN_VALUE`. Unknown value is explicit and does not coerce rewards or net
value to zero.

## Product event

```json
{
  "event_id": "uuid",
  "event_type": "next_interest_selected",
  "created_at": "2026-09-08T00:00:00Z",
  "journey": "money_value",
  "decision_context": "local_demo",
  "intent": "actual_card_value",
  "reason": null
}
```

Product events intentionally contain no PII, financial values, analytics
identifiers, or raw check inputs.

Contract rules:
- View and start/completion events do not carry `intent` or `reason`.
- `next_interest_selected` requires `intent`.
- `decline_reason_selected` requires both `intent` and `reason`.
- Intent and reason values are restricted by journey.

## Sensitive-data rule

Do not collect or log names, phone numbers, email, PAN, Aadhaar, account or
card numbers, bureau data, raw statements, IP/device fingerprints, or
secrets.
