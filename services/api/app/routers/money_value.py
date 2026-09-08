from fastapi import APIRouter

from app.models.money_value import MoneyValueQuickCheckRequest, MoneyValueQuickCheckResponse
from app.services.audit import record_audit_event

router = APIRouter(prefix="/v1/money-value", tags=["money-value"])


@router.post("/quick-check", response_model=MoneyValueQuickCheckResponse, deprecated=True)
def quick_check(payload: MoneyValueQuickCheckRequest) -> MoneyValueQuickCheckResponse:
    """Legacy internal quick check. Preserved for backwards compatibility.

    The preferred Alpha-50 public endpoint is
    POST /v1/financial-intelligence/money-value-check.
    """
    annual_rewards = payload.monthly_card_spend * 12 * payload.reward_rate_percent / 100
    annual_interest = payload.revolving_balance * payload.revolving_interest_rate_pa
    annual_subscriptions = payload.unused_subscription_cost_monthly * 12
    net_value = annual_rewards - annual_interest - payload.annual_card_fee - annual_subscriptions

    flags = []
    if annual_interest > annual_rewards:
        flags.append("INTEREST_COST_EXCEEDS_REWARDS")
    if payload.annual_card_fee > annual_rewards:
        flags.append("FEE_EXCEEDS_REWARDS")
    if annual_subscriptions > 0:
        flags.append("SUBSCRIPTION_LEAKAGE")

    response = MoneyValueQuickCheckResponse(
        estimated_annual_rewards=round(annual_rewards, 2),
        estimated_annual_interest_cost=round(annual_interest, 2),
        estimated_annual_subscription_leakage=round(annual_subscriptions, 2),
        estimated_net_value=round(net_value, 2),
        flags=flags,
        explanation="Initial estimate based on supplied inputs. Deeper analysis requires permissioned transaction data.",
    )
    record_audit_event(
        event_type="money_value_quick_check",
        policy_version="money_value_v0_1",
        input_snapshot=payload.model_dump(),
        output_snapshot=response.model_dump(),
    )
    return response
