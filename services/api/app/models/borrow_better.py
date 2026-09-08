from pydantic import BaseModel, Field
from typing import List, Optional


class BorrowBetterQuickCheckRequest(BaseModel):
    declared_monthly_income: float = Field(gt=0)
    existing_monthly_emi: float = Field(ge=0)
    requested_loan_amount: float = Field(gt=0)
    requested_tenor_months: int = Field(ge=1, le=360)
    indicative_interest_rate_pa: float = Field(default=0.14, ge=0, le=1)
    monthly_non_emi_commitments: float = Field(default=0, ge=0)
    income_verified: bool = False


class BorrowBetterQuickCheckResponse(BaseModel):
    policy_version: str
    decision: str
    estimated_emi: float
    foir_after_new_emi: float
    post_emi_surplus: float
    comfortable_emi_upper_bound: float
    comfortable_borrowing_range_low: float
    comfortable_borrowing_range_high: float
    reason_codes: List[str]
    explanation: str
    audit_event_id: Optional[str] = None
    audit_event: Optional[dict] = None
