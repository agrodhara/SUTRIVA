from fastapi import APIRouter

from app.models.money_value import MoneyValueCheckRequest, MoneyValueCheckResponse
from app.services import money_value as money_value_service
from app.services.audit import record_audit_event

router = APIRouter(prefix="/v1/financial-intelligence", tags=["financial-intelligence"])


@router.post("/money-value-check", response_model=MoneyValueCheckResponse)
def money_value_check(payload: MoneyValueCheckRequest) -> MoneyValueCheckResponse:
    """Preferred Alpha-50 public Money Value Check endpoint.

    Financial-intelligence diagnostic only: no card recommendation, product
    ranking, marketplace, offer or apply flow.
    """
    result = money_value_service.run_money_value_check(payload)
    output_snapshot = {
        key: result[key]
        for key in (
            "reward_type",
            "reward_input_basis",
            "reward_period",
            "reward_value_amount",
            "annualized_reward_units",
            "annual_spend",
            "estimated_annual_rewards",
            "interest_input_basis",
            "interest_value_known",
            "estimated_annual_interest_cost",
            "estimated_net_annual_value",
            "reward_value_known",
            "unknown_value_reason",
            "value_status",
            "reason_codes",
        )
    }
    event = record_audit_event(
        event_type="money_value_check",
        policy_version=result["policy_version"],
        input_snapshot=payload.model_dump(),
        output_snapshot=output_snapshot,
    )
    return MoneyValueCheckResponse(
        **result,
        audit_event_id=event["audit_event_id"],
        audit_event=event,
    )
