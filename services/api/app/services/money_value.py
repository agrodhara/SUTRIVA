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

UNKNOWN_VALUE_STATUS = "UNKNOWN_VALUE"

UNKNOWN_VALUE_ACTION = (
    "Add your reward details when you can so this estimate can calculate card value more reliably."
)

UNKNOWN_INTEREST_ACTION = (
    "Add your carried balance details when you can so this estimate can include interest cost reliably."
)


def reward_period_multiplier(period: str) -> int:
    if period == "monthly":
        return 12
    if period == "quarterly":
        return 4
    return 1


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
    if (
        payload.estimated_reward_rate_percent is not None
        and payload.estimated_reward_rate_percent < LOW_REWARD_RATE_THRESHOLD_PERCENT
    ):
        codes.append("LOW_REWARD_CAPTURE")
    return codes


def estimate_annual_rewards(payload: MoneyValueCheckRequest) -> tuple[float | None, str | None]:
    basis = payload.reward_input_basis
    if basis is None:
        if payload.estimated_reward_rate_percent is not None:
            basis = "rate_percent"
        elif payload.reward_type == "cashback" and payload.cashback_amount is not None:
            basis = "cashback_amount"
        elif payload.reward_type in {"points", "miles"} and payload.reward_value_amount is not None:
            basis = "known_reward_value"
        elif payload.reward_type in {"points", "miles"} and payload.reward_units_earned is not None:
            basis = "earned_units"

    if payload.reward_value_unknown or payload.reward_type == "not_sure":
        return None, "REWARD_VALUE_UNKNOWN"

    if basis == "rate_percent":
        if payload.estimated_reward_rate_percent is None:
            return None, "REWARD_RATE_MISSING"
        annual_spend = payload.monthly_card_spend * 12
        return annual_spend * (payload.estimated_reward_rate_percent / 100), None

    if basis == "cashback_amount":
        if payload.cashback_amount is None or payload.reward_period is None:
            return None, "CASHBACK_INPUT_INCOMPLETE"
        multiplier = reward_period_multiplier(payload.reward_period)
        return payload.cashback_amount * multiplier, None

    if basis == "known_reward_value":
        if payload.reward_value_amount is None or payload.reward_period is None:
            return None, "REWARD_VALUE_INPUT_INCOMPLETE"
        multiplier = reward_period_multiplier(payload.reward_period)
        return payload.reward_value_amount * multiplier, None

    if basis == "earned_units":
        if payload.reward_units_earned is None or payload.reward_period is None:
            return None, "REWARD_UNITS_INPUT_INCOMPLETE"
        if payload.rupee_value_per_reward_unit is None:
            return None, "REWARD_CONVERSION_UNKNOWN"
        units_multiplier = reward_period_multiplier(payload.reward_period)
        annual_units = payload.reward_units_earned * units_multiplier
        return annual_units * payload.rupee_value_per_reward_unit, None

    return None, "REWARD_INPUT_UNKNOWN"


def estimate_annual_interest_cost(payload: MoneyValueCheckRequest) -> tuple[float | None, str | None, str]:
    basis = payload.interest_input_basis
    if basis is None:
        if payload.interest_value_unknown:
            basis = "unknown"
        elif payload.revolving_balance is None and payload.annual_interest_rate_percent is None:
            basis = "no_balance"
        else:
            basis = "known"

    if basis == "unknown" or payload.interest_value_unknown:
        return None, "INTEREST_VALUE_UNKNOWN", "unknown"

    if basis == "no_balance":
        return 0.0, None, "no_balance"

    revolving_balance = payload.revolving_balance or 0.0
    annual_interest_rate_percent = payload.annual_interest_rate_percent or 0.0
    return revolving_balance * (annual_interest_rate_percent / 100), None, "known"


def run_money_value_check(payload: MoneyValueCheckRequest) -> dict:
    """Run the Money Value Check calculation. Backend owns all calculations."""
    annual_spend = payload.monthly_card_spend * 12
    estimated_annual_rewards, unknown_reason = estimate_annual_rewards(payload)
    estimated_annual_interest_cost, interest_unknown_reason, resolved_interest_basis = estimate_annual_interest_cost(payload)

    missing_reasons: List[str] = []
    if estimated_annual_rewards is None:
        missing_reasons.append(unknown_reason or "REWARD_VALUE_UNKNOWN")
    if estimated_annual_interest_cost is None:
        missing_reasons.append(interest_unknown_reason or "INTEREST_VALUE_UNKNOWN")

    if missing_reasons:
        value_status = UNKNOWN_VALUE_STATUS
        reason_codes = missing_reasons
        if estimated_annual_interest_cost is not None and estimated_annual_interest_cost > 0:
            reason_codes.append("REVOLVING_INTEREST_DRAG")
        estimated_net_annual_value = None
        if unknown_reason is not None:
            next_best_action = UNKNOWN_VALUE_ACTION
        else:
            next_best_action = UNKNOWN_INTEREST_ACTION
    else:
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
        next_best_action = NEXT_BEST_ACTIONS[value_status]

    basis = payload.reward_input_basis
    if basis is None:
        if payload.estimated_reward_rate_percent is not None:
            basis = "rate_percent"
        elif payload.reward_type == "cashback" and payload.cashback_amount is not None:
            basis = "cashback_amount"
        elif payload.reward_type in {"points", "miles"} and payload.reward_value_amount is not None:
            basis = "known_reward_value"
        elif payload.reward_type in {"points", "miles"} and payload.reward_units_earned is not None:
            basis = "earned_units"

    annualized_reward_units = None
    if basis == "earned_units" and payload.reward_units_earned is not None and payload.reward_period is not None:
        annualized_reward_units = payload.reward_units_earned * reward_period_multiplier(payload.reward_period)

    return {
        "policy_version": POLICY_VERSION,
        "reward_type": payload.reward_type,
        "reward_input_basis": basis,
        "reward_period": payload.reward_period,
        "reward_value_amount": round(payload.reward_value_amount, 2) if payload.reward_value_amount is not None else None,
        "annualized_reward_units": round(annualized_reward_units, 2) if annualized_reward_units is not None else None,
        "annual_spend": round(annual_spend, 2),
        "estimated_annual_rewards": round(estimated_annual_rewards, 2) if estimated_annual_rewards is not None else None,
        "annual_card_fee": round(payload.annual_card_fee, 2),
        "interest_input_basis": resolved_interest_basis,
        "interest_value_known": estimated_annual_interest_cost is not None,
        "estimated_annual_interest_cost": round(estimated_annual_interest_cost, 2) if estimated_annual_interest_cost is not None else None,
        "estimated_net_annual_value": round(estimated_net_annual_value, 2) if estimated_net_annual_value is not None else None,
        "reward_value_known": estimated_annual_rewards is not None,
        "unknown_value_reason": (missing_reasons[0] if missing_reasons else None),
        "value_status": value_status,
        "reason_codes": reason_codes,
        "next_best_action": next_best_action,
        "guidance_disclaimer": GUIDANCE_DISCLAIMER,
    }
