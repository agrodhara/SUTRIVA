# Data Contracts — Alpha-50 Draft

## User-declared profile

```json
{
  "user_id": "optional-alpha-id",
  "declared_monthly_income": 150000,
  "employment_type": "salaried",
  "country": "IN",
  "consent_version": "alpha_consent_v0_1"
}
```

## Borrow Better input

```json
{
  "declared_monthly_income": 150000,
  "existing_monthly_emi": 35000,
  "desired_loan_amount": 800000,
  "tenure_months": 36,
  "indicative_interest_rate_pa": 0.15
}
```

## Decision result

```json
{
  "decision_id": "uuid",
  "journey": "borrow_better",
  "policy_version": "borrow_better_v0_1",
  "status": "CAUTION",
  "outputs": {},
  "reason_codes": [],
  "created_at": "2026-09-08T00:00:00Z"
}
```

## Audit event (Alpha local JSONL implementation)

```json
{
  "audit_event_id": "uuid",
  "event_type": "borrow_better_quick_check",
  "created_at": "2026-09-08T00:00:00Z",
  "policy_version": "borrow_better_v0_1",
  "decision_context": "local_demo",
  "input_snapshot": {},
  "output_snapshot": {}
}
```

Alpha implementation note: audit events are appended to a local JSONL file (`services/api/audit_events.jsonl`, path overridable via `AUDIT_LOG_PATH`). This is local traceability for guidance outputs, not production audit infrastructure. It never contains name, phone, email, PAN, Aadhaar, bank account number, card number, raw statement lines, bureau fields, device fingerprint, location or IP address.

## Sensitive-data rule

Do not log full bank statements, PAN, account numbers, raw documents, API secrets or unnecessary personal data.
