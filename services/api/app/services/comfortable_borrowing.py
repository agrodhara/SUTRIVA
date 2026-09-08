from __future__ import annotations

from app.models.comfortable_borrowing import (
    ComfortableBorrowingCheckRequest,
    ComfortableBorrowingCheckResponse,
)

ANNUAL_INTEREST_RATE = 0.12
POLICY_VERSION = "alpha50-comfort-v0.1"


def estimate_monthly_commitment(principal: float, tenure_months: int) -> float:
    monthly_rate = ANNUAL_INTEREST_RATE / 12
    if monthly_rate == 0:
        return principal / tenure_months
    factor = (1 + monthly_rate) ** tenure_months
    return principal * monthly_rate * factor / (factor - 1)


def build_comfortable_borrowing_check(
    payload: ComfortableBorrowingCheckRequest,
) -> ComfortableBorrowingCheckResponse:
    estimated_commitment = estimate_monthly_commitment(
        payload.desired_borrowing_amount,
        payload.desired_tenure_months,
    )
    total_commitment = payload.existing_monthly_commitments + estimated_commitment
    commitment_ratio = total_commitment / payload.monthly_income

    if commitment_ratio <= 0.35:
        comfort_status = "COMFORTABLE"
        reason_code = "COMMITMENT_RATIO_COMFORTABLE"
        next_best_action = (
            "This borrowing amount appears financially comfortable based on the information "
            "provided. Keep an emergency buffer before making a final decision."
        )
    elif commitment_ratio <= 0.50:
        comfort_status = "CAUTION"
        reason_code = "COMMITMENT_RATIO_CAUTION"
        next_best_action = (
            "Your monthly commitments may still be manageable, but keep a buffer before "
            "taking on this amount."
        )
    else:
        comfort_status = "STRETCHED"
        reason_code = "COMMITMENT_RATIO_STRETCHED"
        next_best_action = (
            "This amount may put pressure on your monthly cash flow. Consider reducing the "
            "amount, extending tenure, or lowering existing commitments first."
        )

    return ComfortableBorrowingCheckResponse(
        estimated_new_monthly_commitment=round(estimated_commitment, 2),
        total_monthly_commitment=round(total_commitment, 2),
        commitment_ratio=round(commitment_ratio, 4),
        comfort_status=comfort_status,
        reason_codes=[reason_code],
        next_best_action=next_best_action,
        policy_version=POLICY_VERSION,
        guidance_disclaimer=(
            "This is a financial comfort estimate, not a loan approval, eligibility "
            "decision, lender offer, or credit recommendation."
        ),
        audit_event={
            "event_type": "comfortable_borrowing_check",
            "policy_version": POLICY_VERSION,
            "decision_context": "local_demo",
        },
    )
