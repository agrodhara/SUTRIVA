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

## Comfortable Borrowing Check

Comfortable Borrowing Check is guidance only. It is not a loan approval, eligibility
decision, lender offer, marketplace, or application flow.

The request contains `monthly_income`, `existing_monthly_commitments`,
`desired_borrowing_amount`, and `desired_tenure_months`. All values must be
positive except existing commitments, which may be zero.

The response contains `estimated_new_monthly_commitment`,
`total_monthly_commitment`, decimal `commitment_ratio`, `comfort_status`,
`reason_codes`, `next_best_action`, `policy_version`, `guidance_disclaimer`, and
the following audit stub:

```json
{
  "event_type": "comfortable_borrowing_check",
  "policy_version": "alpha50-comfort-v0.1",
  "decision_context": "local_demo"
}
```

Alpha uses a placeholder annual interest rate of `0.12` and standard EMI
calculation. Placeholder thresholds are `COMFORTABLE <= 0.35`, `CAUTION >
0.35 and <= 0.50`, and `STRETCHED > 0.50`. Reason codes map deterministically to
those three statuses.
