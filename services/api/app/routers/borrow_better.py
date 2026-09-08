from fastapi import APIRouter

from app.models.borrow_better import BorrowBetterQuickCheckRequest, BorrowBetterQuickCheckResponse
from app.services.affordability import build_affordability_features, estimate_principal_from_emi
from app.services.policy import borrow_better_engine
from app.services.audit import record_audit_event

router = APIRouter(prefix="/v1/borrow-better", tags=["borrow-better"])


@router.post("/quick-check", response_model=BorrowBetterQuickCheckResponse)
def quick_check(payload: BorrowBetterQuickCheckRequest) -> BorrowBetterQuickCheckResponse:
    features = build_affordability_features(payload)
    decision = borrow_better_engine().evaluate(features)

    comfortable_emi = max(0, payload.declared_monthly_income * 0.40 - payload.existing_monthly_emi)
    low = estimate_principal_from_emi(comfortable_emi * 0.80, payload.indicative_interest_rate_pa, payload.requested_tenor_months)
    high = estimate_principal_from_emi(comfortable_emi, payload.indicative_interest_rate_pa, payload.requested_tenor_months)

    response = BorrowBetterQuickCheckResponse(
        policy_version=decision.policy_version,
        decision=decision.decision,
        estimated_emi=round(features["estimated_new_emi"], 2),
        foir_after_new_emi=round(features["foir_after_new_emi"], 4),
        post_emi_surplus=round(features["post_emi_surplus"], 2),
        comfortable_emi_upper_bound=round(comfortable_emi, 2),
        comfortable_borrowing_range_low=round(low, 2),
        comfortable_borrowing_range_high=round(high, 2),
        reason_codes=decision.reason_codes,
        explanation=decision.explanation,
    )

    record = record_audit_event(
        event_type="borrow_better_quick_check",
        policy_version=decision.policy_version,
        input_snapshot=payload.model_dump(),
        output_snapshot=response.model_dump(),
        decision_context="local_demo",
    )
    response.audit_event_id = record
    response.audit_event = {
        "event_type": "borrow_better_quick_check",
        "policy_version": decision.policy_version,
        "decision_context": "local_demo",
    }
    return response
