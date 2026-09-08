"""Money Value Check policy logic (Alpha-50).

Single source of truth for the preferred public endpoint
POST /v1/financial-intelligence/money-value-check.

This is an Alpha-50 diagnostic, not a card recommendation engine. It does not
rank, recommend or match card products and exposes no acquisition/apply flow.

Calculation limitations (deliberately simple, indicative only):
- estimated_annual_interest_cost is a simple annualized estimate
  (revolving_balance * annual_interest_rate_percent / 100), not a
  billing-system calculation.
- Value-status thresholds (+/-1000) are placeholder Alpha-50 thresholds, not
  financial-advice standards.
"""

from __future__ import annotations

from typing import List

from app.models.money_value import MoneyValueCheckRequest

POLICY_VERSION = "alpha50-money-value-v0.1"

VALUE_STATUS_POSITIVE = "POSITIVE"
VALUE_STATUS_NEUTRAL = "NEUTRAL"
VALUE_STATUS_VALUE_LEAKAGE = "VALUE_LEAKAGE"

# Placeholder Alpha-50 thresholds, not financial-advice standards.
NET_VALUE_POSITIVE_THRESHOLD = 1000
NET_VALUE_NEGATIVE_THRESHOLD = -1000
LOW_REWARD_RATE_THRESHOLD_PERCENT = 0.5

GUIDANCE_DISCLAIMER = (
    "This is an indicative money-value estimate based on the information provided. "
    "It is not a card recommendation, product offer, or financial advice."
)

NEXT_BEST_ACTIONS = {
    VALUE_STATUS_POSITIVE: (
        "You appear to be getting positive annual value from this card. "
        "Keep monitoring fees, reward usage, and whether you revolve balances."
    ),
    VALUE_STATUS_NEUTRAL: (
        "The card appears roughly value-neutral based on the information provided. "
        "Review whether the rewards and benefits justify the annual fee."
    ),
    VALUE_STATUS_VALUE_LEAKAGE: (
        "You may be losing value through fees, low reward capture, or revolving interest. "
        "Consider changing how you use the card before considering another product."
    ),
}


def classify_value_status(net_annual_value: float) -> str:
    if net_annual_value > NET_VALUE_POSITIVE_THRESHOLD:
        return VALUE_STATUS_POSITIVE
    if net_annual_value < NET_VALUE_NEGATIVE_THRESHOLD:
        return VALUE_STATUS_VALUE_LEAKAGE
    return VALUE_STATUS_NEUTRAL


def build_reason_codes(
    payload: MoneyValueCheckRequest,
    value_status: str,
    annual_card_fee: float,
    estimated_annual_rewards: float,
    estimated_annual_interest_cost: float,
) -> List[str]:
    """Deterministic reason codes for a Money Value Check result."""
    codes: List[str] = []
    if value_status == VALUE_STATUS_POSITIVE:
        codes.append("NET_VALUE_POSITIVE")
    elif value_status == VALUE_STATUS_NEUTRAL:
        codes.append("NET_VALUE_NEUTRAL")
    else:
        codes.append("NET_VALUE_NEGATIVE")
    if annual_card_fee > 0 and annual_card_fee >= estimated_annual_rewards:
        codes.append("ANNUAL_FEE_DRAG")
    if estimated_annual_interest_cost > 0:
        codes.append("REVOLVING_INTEREST_DRAG")
    if payload.estimated_reward_rate_percent < LOW_REWARD_RATE_THRESHOLD_PERCENT:
        codes.append("LOW_REWARD_CAPTURE")
    return codes


def run_money_value_check(payload: MoneyValueCheckRequest) -> dict:
    """Run the Money Value Check calculation. Backend owns all calculations."""
    annual_spend = payload.monthly_card_spend * 12
    estimated_annual_rewards = annual_spend * (payload.estimated_reward_rate_percent / 100)
    estimated_annual_interest_cost = payload.revolving_balance * (payload.annual_interest_rate_percent / 100)
    estimated_net_annual_value = (
        estimated_annual_rewards - payload.annual_card_fee - estimated_annual_interest_cost
    )

    value_status = classify_value_status(estimated_net_annual_value)
    reason_codes = build_reason_codes(
        payload,
        value_status,
        payload.annual_card_fee,
        estimated_annual_rewards,
        estimated_annual_interest_cost,
    )

    return {
        "policy_version": POLICY_VERSION,
        "annual_spend": round(annual_spend, 2),
        "estimated_annual_rewards": round(estimated_annual_rewards, 2),
        "annual_card_fee": round(payload.annual_card_fee, 2),
        "estimated_annual_interest_cost": round(estimated_annual_interest_cost, 2),
        "estimated_net_annual_value": round(estimated_net_annual_value, 2),
        "value_status": value_status,
        "reason_codes": reason_codes,
        "next_best_action": NEXT_BEST_ACTIONS[value_status],
        "guidance_disclaimer": GUIDANCE_DISCLAIMER,
    }
