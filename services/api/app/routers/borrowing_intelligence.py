from fastapi import APIRouter

from app.models.borrow_better import BorrowBetterQuickCheckRequest
from app.models.borrowing_intelligence import (
    ComfortableBorrowingCheckRequest,
    ComfortableBorrowingCheckResponse,
    EmiPreviewRequest,
    EmiPreviewResponse,
    LoanReductionNudge,
    MainPressure,
)
from app.config import borrow_illustrative_annual_rate_percent
from app.services.affordability import build_affordability_features, estimate_emi, estimate_loan_reduction_nudge
from app.services.policy import borrow_better_engine
from app.services.audit import record_audit_event

GUIDANCE_DISCLAIMER = (
    "Indicative financial-intelligence guidance based on supplied inputs. "
    "This is not a loan offer, approval, pre-approval, or eligibility decision."
)

router = APIRouter(prefix="/v1/borrowing-intelligence", tags=["borrowing-intelligence"])


@router.post("/emi-preview", response_model=EmiPreviewResponse)
def emi_preview(payload: EmiPreviewRequest) -> EmiPreviewResponse:
    """Lightweight EMI preview for the Borrow Better plan step.

    Uses the configured policy rate and the same `estimate_emi` as the full check. It records no audit
    event and no product event, and it persists nothing: the request carries only the amount and tenure.
    """
    rate_percent = borrow_illustrative_annual_rate_percent()
    emi = estimate_emi(payload.desired_borrowing_amount, rate_percent / 100, payload.desired_tenure_months)
    return EmiPreviewResponse(
        illustrative_annual_rate_percent=rate_percent,
        estimated_monthly_emi=round(emi, 2),
        guidance_disclaimer=GUIDANCE_DISCLAIMER,
    )


@router.post("/comfortable-borrowing-check", response_model=ComfortableBorrowingCheckResponse)
def comfortable_borrowing_check(payload: ComfortableBorrowingCheckRequest) -> ComfortableBorrowingCheckResponse:
    """Product-aligned public route for the Comfortable Borrowing Check.

    Reuses the same affordability calculation and decision-engine rules as
    `/v1/borrow-better/quick-check` (via `build_affordability_features` and
    `borrow_better_engine()`). No calculation logic is duplicated here — this
    endpoint only translates request/response field names for product alignment.
    """
    # The request model only admits an omitted or policy-equal rate, so this is always the configured rate.
    illustrative_rate_percent = borrow_illustrative_annual_rate_percent()
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

    main_pressure = MainPressure(code="PROPOSED_EMI_REDUCES_BREATHING_ROOM", monthly_amount=estimated_new_monthly_commitment)
    nudge = estimate_loan_reduction_nudge(
        payload.desired_borrowing_amount,
        illustrative_rate_percent / 100,
        payload.desired_tenure_months,
    )
    # Descriptive notes only. They never feed the decision engine or the numeric calculation.
    reconciliation_note = {
        "fall_short": "MONTH_END_FALL_SHORT",
        "not_sure": "MONTH_END_POSITION_UNKNOWN",
    }.get(payload.month_end_position or "")
    emi_ending_note = (
        "EMI_MAY_END_WITHIN_SIX_MONTHS" if payload.existing_emi_ending_within_six_months == "yes" else None
    )

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
        main_pressure=main_pressure,
        loan_reduction_nudge=LoanReductionNudge(**nudge) if nudge else None,
        reconciliation_note=reconciliation_note,
        emi_ending_note=emi_ending_note,
        comfort_status=decision.decision,
        reason_codes=decision.reason_codes,
        next_best_action=decision.explanation,
        guidance_disclaimer=GUIDANCE_DISCLAIMER,
    )

    audit_event = record_audit_event(
        event_type="comfortable_borrowing_check",
        policy_version=decision.policy_version,
        input_snapshot=payload,
        output_snapshot=response.model_dump(exclude={"audit_event_id", "audit_event"}),
        decision_context="local_demo",
    )
    response.audit_event_id = audit_event["audit_event_id"]
    response.audit_event = audit_event
    return response
