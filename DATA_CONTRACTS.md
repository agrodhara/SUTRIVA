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

## Audit event

```json
{
  "event_id": "uuid",
  "event_type": "decision_evaluated",
  "journey": "borrow_better",
  "policy_version": "borrow_better_v0_1",
  "input_summary": {},
  "output_summary": {},
  "reason_codes": [],
  "created_at": "2026-09-08T00:00:00Z"
}
```

## Sensitive-data rule

Do not log full bank statements, PAN, account numbers, raw documents, API secrets or unnecessary personal data.
