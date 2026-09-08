from fastapi import APIRouter

from app.models.borrow_better import BorrowBetterQuickCheckRequest
from app.models.borrowing_intelligence import (
    ComfortableBorrowingCheckRequest,
    ComfortableBorrowingCheckResponse,
)
from app.services.affordability import build_affordability_features
from app.services.policy import borrow_better_engine
from app.services.audit import record_audit_event

GUIDANCE_DISCLAIMER = (
    "Indicative financial-intelligence guidance based on supplied inputs. "
    "This is not a loan offer, approval, pre-approval, or eligibility decision."
)

router = APIRouter(prefix="/v1/borrowing-intelligence", tags=["borrowing-intelligence"])


@router.post("/comfortable-borrowing-check", response_model=ComfortableBorrowingCheckResponse)
def comfortable_borrowing_check(payload: ComfortableBorrowingCheckRequest) -> ComfortableBorrowingCheckResponse:
    """Product-aligned public route for the Comfortable Borrowing Check.

    Reuses the same affordability calculation and decision-engine rules as
    `/v1/borrow-better/quick-check` (via `build_affordability_features` and
    `borrow_better_engine()`). No calculation logic is duplicated here — this
    endpoint only translates request/response field names for product alignment.
    """
    internal_payload = BorrowBetterQuickCheckRequest(
        declared_monthly_income=payload.monthly_income,
        existing_monthly_emi=payload.existing_monthly_commitments,
        requested_loan_amount=payload.desired_borrowing_amount,
        requested_tenor_months=payload.desired_tenure_months,
    )

    features = build_affordability_features(internal_payload)
    decision = borrow_better_engine().evaluate(features)

    estimated_new_monthly_commitment = round(features["estimated_new_emi"], 2)
    total_monthly_commitment = round(features["total_monthly_commitment"], 2)
    commitment_ratio = round(features["total_monthly_commitment"] / payload.monthly_income, 4)

    response = ComfortableBorrowingCheckResponse(
        policy_version=decision.policy_version,
        estimated_new_monthly_commitment=estimated_new_monthly_commitment,
        total_monthly_commitment=total_monthly_commitment,
        commitment_ratio=commitment_ratio,
        comfort_status=decision.decision,
        reason_codes=decision.reason_codes,
        next_best_action=decision.explanation,
        guidance_disclaimer=GUIDANCE_DISCLAIMER,
    )

    audit_event = record_audit_event(
        event_type="comfortable_borrowing_check",
        policy_version=decision.policy_version,
        input_snapshot=payload.model_dump(),
        output_snapshot=response.model_dump(exclude={"audit_event_id", "audit_event"}),
        decision_context="local_demo",
    )
    response.audit_event_id = audit_event["audit_event_id"]
    response.audit_event = audit_event
    return response
