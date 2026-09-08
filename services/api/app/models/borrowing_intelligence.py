from pydantic import BaseModel, Field
from typing import List, Optional


class ComfortableBorrowingCheckRequest(BaseModel):
    monthly_income: float = Field(gt=0)
    existing_monthly_commitments: float = Field(ge=0)
    desired_borrowing_amount: float = Field(gt=0)
    desired_tenure_months: int = Field(ge=1, le=360)


class ComfortableBorrowingCheckResponse(BaseModel):
    policy_version: str
    estimated_new_monthly_commitment: float
    total_monthly_commitment: float
    commitment_ratio: float
    comfort_status: str
    reason_codes: List[str]
    next_best_action: str
    guidance_disclaimer: str
    audit_event_id: Optional[str] = None
    audit_event: Optional[dict] = None
