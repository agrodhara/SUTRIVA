from pydantic import BaseModel, Field
from typing import Any, Dict, List


class MoneyValueQuickCheckRequest(BaseModel):
    monthly_card_spend: float = Field(ge=0)
    annual_card_fee: float = Field(ge=0)
    reward_rate_percent: float = Field(default=1.0, ge=0, le=20)
    revolving_balance: float = Field(default=0, ge=0)
    revolving_interest_rate_pa: float = Field(default=0.36, ge=0, le=1)
    unused_subscription_cost_monthly: float = Field(default=0, ge=0)


class MoneyValueQuickCheckResponse(BaseModel):
    estimated_annual_rewards: float
    estimated_annual_interest_cost: float
    estimated_annual_subscription_leakage: float
    estimated_net_value: float
    flags: List[str]
    explanation: str


class MoneyValueCheckRequest(BaseModel):
    """Preferred Alpha-50 public contract for Money Value Check.

    User-declared estimates only. No card number, issuer, PAN, customer ID,
    phone, email, account number, statement upload or transaction-level data.
    """

    monthly_card_spend: float = Field(ge=0)
    annual_card_fee: float = Field(ge=0)
    estimated_reward_rate_percent: float = Field(ge=0)
    revolving_balance: float = Field(default=0, ge=0)
    annual_interest_rate_percent: float = Field(default=0, ge=0)


class MoneyValueCheckResponse(BaseModel):
    policy_version: str
    annual_spend: float
    estimated_annual_rewards: float
    annual_card_fee: float
    estimated_annual_interest_cost: float
    estimated_net_annual_value: float
    value_status: str
    reason_codes: List[str]
    next_best_action: str
    guidance_disclaimer: str
    audit_event_id: str
    audit_event: Dict[str, Any]
