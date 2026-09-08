from app.models.borrow_better import BorrowBetterQuickCheckRequest


def estimate_emi(principal: float, annual_rate: float, tenor_months: int) -> float:
    monthly_rate = annual_rate / 12
    if monthly_rate == 0:
        return principal / tenor_months
    factor = (1 + monthly_rate) ** tenor_months
    return principal * monthly_rate * factor / (factor - 1)


def estimate_principal_from_emi(emi: float, annual_rate: float, tenor_months: int) -> float:
    if emi <= 0:
        return 0
    monthly_rate = annual_rate / 12
    if monthly_rate == 0:
        return emi * tenor_months
    factor = (1 + monthly_rate) ** tenor_months
    return emi * (factor - 1) / (monthly_rate * factor)


def build_affordability_features(payload: BorrowBetterQuickCheckRequest) -> dict:
    estimated_new_emi = estimate_emi(
        payload.requested_loan_amount,
        payload.indicative_interest_rate_pa,
        payload.requested_tenor_months,
    )
    total_commitments = payload.existing_monthly_emi + estimated_new_emi + payload.monthly_non_emi_commitments
    post_emi_surplus = payload.declared_monthly_income - total_commitments
    minimum_monthly_buffer = max(10000, payload.declared_monthly_income * 0.20)

    return {
        "estimated_new_emi": estimated_new_emi,
        "total_monthly_commitment": total_commitments,
        "foir_after_new_emi": (payload.existing_monthly_emi + estimated_new_emi) / payload.declared_monthly_income,
        "post_emi_surplus": post_emi_surplus,
        "minimum_monthly_buffer": minimum_monthly_buffer,
        "income_verified": payload.income_verified,
    }
