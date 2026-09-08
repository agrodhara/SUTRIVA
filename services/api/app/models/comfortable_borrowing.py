from typing import List

from pydantic import BaseModel, Field


class ComfortableBorrowingCheckRequest(BaseModel):
    monthly_income: float = Field(gt=0)
    existing_monthly_commitments: float = Field(ge=0)
    desired_borrowing_amount: float = Field(gt=0)
    desired_tenure_months: int = Field(gt=0)


class AuditEvent(BaseModel):
    event_type: str
    policy_version: str
    decision_context: str


class ComfortableBorrowingCheckResponse(BaseModel):
    estimated_new_monthly_commitment: float
    total_monthly_commitment: float
    commitment_ratio: float
    comfort_status: str
    reason_codes: List[str]
    next_best_action: str
    policy_version: str
    guidance_disclaimer: str
    audit_event: AuditEvent
