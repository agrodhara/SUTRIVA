from fastapi import APIRouter

from app.models.borrow_better import BorrowBetterQuickCheckRequest
from app.models.borrowing_intelligence import (
    ComfortableBorrowingCheckRequest,
    ComfortableBorrowingCheckResponse,
)
from app.config import borrow_illustrative_annual_rate_percent
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
    illustrative_rate_percent = (
        payload.illustrative_annual_rate_percent
        if payload.illustrative_annual_rate_percent is not None
        else borrow_illustrative_annual_rate_percent()
    )
    existing_debt_payments = float(payload.existing_debt_payments)
    non_debt_commitments = (
        float(payload.housing_rent or 0)
        + float(payload.household_utilities or 0)
        + float(payload.dependants_education or 0)
        + float(payload.recurring_medical_insurance or 0)
        + float(payload.other_essential_commitments or 0)
    )
    internal_payload = BorrowBetterQuickCheckRequest(
        declared_monthly_income=payload.monthly_income,
        existing_monthly_emi=existing_debt_payments,
        requested_loan_amount=payload.desired_borrowing_amount,
        requested_tenor_months=payload.desired_tenure_months,
        indicative_interest_rate_pa=illustrative_rate_percent / 100,
        monthly_non_emi_commitments=non_debt_commitments,
        income_verified=payload.income_verified,
    )

    features = build_affordability_features(internal_payload)
    decision = borrow_better_engine().evaluate(features)

    debt_ratio_before = round(existing_debt_payments / payload.monthly_income, 4)
    debt_ratio_after = round((existing_debt_payments + features["estimated_new_emi"]) / payload.monthly_income, 4)
    committed_ratio_before = round((existing_debt_payments + non_debt_commitments) / payload.monthly_income, 4)
    committed_ratio_after = round((existing_debt_payments + features["estimated_new_emi"] + non_debt_commitments) / payload.monthly_income, 4)
    breathing_room_before = round(payload.monthly_income - existing_debt_payments - non_debt_commitments, 2)
    breathing_room_after = round(payload.monthly_income - existing_debt_payments - features["estimated_new_emi"] - non_debt_commitments, 2)
    estimated_new_monthly_commitment = round(features["estimated_new_emi"], 2)
    total_monthly_commitment = round(features["total_monthly_commitment"], 2)
    commitment_ratio = round(features["total_monthly_commitment"] / payload.monthly_income, 4)
    total_repayment = round(features["total_repayment"], 2)
    total_interest = round(features["total_interest"], 2)

    response = ComfortableBorrowingCheckResponse(
        policy_version=decision.policy_version,
        illustrative_annual_rate_percent=illustrative_rate_percent,
        existing_debt_payments=round(existing_debt_payments, 2),
        non_debt_commitments=round(non_debt_commitments, 2),
        estimated_new_monthly_commitment=estimated_new_monthly_commitment,
        total_monthly_commitment=total_monthly_commitment,
        commitment_ratio=commitment_ratio,
        debt_ratio_before=debt_ratio_before,
        debt_ratio_after=debt_ratio_after,
        committed_ratio_before=committed_ratio_before,
        committed_ratio_after=committed_ratio_after,
        breathing_room_before=breathing_room_before,
        breathing_room_after=breathing_room_after,
        total_repayment=total_repayment,
        total_interest=total_interest,
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
