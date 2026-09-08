from fastapi import APIRouter

from app.models.money_value import MoneyValueQuickCheckRequest, MoneyValueQuickCheckResponse
from app.routers.money_value import quick_check as money_value_quick_check

router = APIRouter(prefix="/v1/financial-intelligence", tags=["financial-intelligence"])


@router.post("/money-value-check", response_model=MoneyValueQuickCheckResponse)
def money_value_check(payload: MoneyValueQuickCheckRequest) -> MoneyValueQuickCheckResponse:
    """Preferred public route. Delegates to the existing money-value logic; no duplicated logic."""
    return money_value_quick_check(payload)
