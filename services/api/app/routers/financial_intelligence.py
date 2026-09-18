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
    event = record_audit_event(
        event_type="money_value_check",
        policy_version=result["policy_version"],
        input_snapshot=payload,
        output_snapshot=result,
    )
    return MoneyValueCheckResponse(
        **result,
        audit_event_id=event["audit_event_id"],
        audit_event=event,
    )
