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

## Money Value Check input (preferred: POST /v1/financial-intelligence/money-value-check)

User-declared estimates only. No card number, issuer, PAN, customer ID, phone,
email, account number, statement upload or transaction-level data.

```json
{
  "monthly_card_spend": 50000,
  "annual_card_fee": 4000,
  "estimated_reward_rate_percent": 1.5,
  "revolving_balance": 0,
  "annual_interest_rate_percent": 36
}
```

## Money Value Check result

```json
{
  "policy_version": "alpha50-money-value-v0.1",
  "annual_spend": 600000,
  "estimated_annual_rewards": 9000,
  "annual_card_fee": 4000,
  "estimated_annual_interest_cost": 0,
  "estimated_net_annual_value": 5000,
  "value_status": "POSITIVE",
  "reason_codes": ["NET_VALUE_POSITIVE"],
  "next_best_action": "You appear to be getting positive annual value from this card. Keep monitoring fees, reward usage, and whether you revolve balances.",
  "guidance_disclaimer": "This is an indicative money-value estimate based on the information provided. It is not a card recommendation, product offer, or financial advice.",
  "audit_event_id": "uuid",
  "audit_event": {
    "event_type": "money_value_check",
    "policy_version": "alpha50-money-value-v0.1",
    "decision_context": "local_demo"
  }
}
```

`value_status` is one of `POSITIVE`, `NEUTRAL`, `VALUE_LEAKAGE` (placeholder
Alpha-50 thresholds of +/-1000 on net annual value, not financial-advice
standards). All monetary values are rounded to two decimals. The interest-cost
figure is a simple annualized estimate, not a billing-system calculation.

## Money Value Check audit event

One JSONL audit event is appended per check via the shared audit service:

```json
{
  "audit_event_id": "uuid",
  "event_type": "money_value_check",
  "created_at": "2026-09-08T00:00:00Z",
  "policy_version": "alpha50-money-value-v0.1",
  "decision_context": "local_demo",
  "input_snapshot": {
    "monthly_card_spend": 50000,
    "annual_card_fee": 4000,
    "estimated_reward_rate_percent": 1.5,
    "revolving_balance": 0,
    "annual_interest_rate_percent": 36
  },
  "output_snapshot": {
    "annual_spend": 600000,
    "estimated_annual_rewards": 9000,
    "estimated_annual_interest_cost": 0,
    "estimated_net_annual_value": 5000,
    "value_status": "POSITIVE",
    "reason_codes": ["NET_VALUE_POSITIVE"]
  }
}
```

Never logged: name, email, phone, PAN, card number, account number, raw
transaction data, issuer account IDs.

## Sensitive-data rule

Do not log full bank statements, PAN, account numbers, raw documents, API secrets or unnecessary personal data.
