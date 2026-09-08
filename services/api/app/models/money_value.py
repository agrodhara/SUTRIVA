from pydantic import BaseModel, Field
from typing import List


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
