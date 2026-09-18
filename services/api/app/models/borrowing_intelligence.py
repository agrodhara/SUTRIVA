from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from app.config import borrow_illustrative_annual_rate_percent


class ComfortableBorrowingCheckRequest(BaseModel):
    calculation_mode: Optional[Literal["legacy_total_commitments", "track_11a_breakdown"]] = None
    monthly_income: float = Field(gt=0)
    existing_debt_payments: Optional[float] = Field(default=None, ge=0)
    existing_monthly_commitments: Optional[float] = Field(default=None, ge=0)
    housing_rent: Optional[float] = Field(default=None, ge=0)
    household_utilities: Optional[float] = Field(default=None, ge=0)
    dependants_education: Optional[float] = Field(default=None, ge=0)
    recurring_medical_insurance: Optional[float] = Field(default=None, ge=0)
    other_essential_commitments: Optional[float] = Field(default=None, ge=0)
    desired_borrowing_amount: float = Field(gt=0)
    desired_tenure_months: int = Field(ge=1, le=360)
    illustrative_annual_rate_percent: Optional[float] = Field(default=None, ge=0, le=100)
    income_verified: bool = False

    @model_validator(mode="after")
    def validate_existing_debt_payments(self) -> "ComfortableBorrowingCheckRequest":
        grouped_values = [
            self.housing_rent,
            self.household_utilities,
            self.dependants_education,
            self.recurring_medical_insurance,
            self.other_essential_commitments,
        ]
        has_any_grouped = any(value is not None for value in grouped_values)
        has_all_grouped = all(value is not None for value in grouped_values)

        if self.calculation_mode is None:
            if self.existing_monthly_commitments is not None and self.existing_debt_payments is None and not has_any_grouped:
                self.calculation_mode = "legacy_total_commitments"
            elif self.existing_debt_payments is not None and self.existing_monthly_commitments is None and has_all_grouped:
                self.calculation_mode = "track_11a_breakdown"
            else:
                raise ValueError("calculation_mode is required when request fields are mixed or incomplete")

        if self.calculation_mode == "legacy_total_commitments":
            if self.existing_monthly_commitments is None:
                raise ValueError("existing_monthly_commitments is required for legacy_total_commitments")
            if self.existing_debt_payments is not None or has_any_grouped:
                raise ValueError("legacy_total_commitments cannot include debt-breakdown fields")
            self.existing_debt_payments = self.existing_monthly_commitments
            self.housing_rent = 0.0
            self.household_utilities = 0.0
            self.dependants_education = 0.0
            self.recurring_medical_insurance = 0.0
            self.other_essential_commitments = 0.0
            return self

        if self.existing_monthly_commitments is not None:
            raise ValueError("track_11a_breakdown cannot include existing_monthly_commitments")
        if self.existing_debt_payments is None:
            raise ValueError("existing_debt_payments is required for track_11a_breakdown")
        if not has_all_grouped:
            raise ValueError("all grouped non-debt commitment fields are required for track_11a_breakdown")
        if self.illustrative_annual_rate_percent is None:
            self.illustrative_annual_rate_percent = borrow_illustrative_annual_rate_percent()
        return self


class ComfortableBorrowingCheckResponse(BaseModel):
    policy_version: str
    illustrative_annual_rate_percent: float
    existing_debt_payments: float
    non_debt_commitments: float
    estimated_new_monthly_commitment: float
    total_monthly_commitment: float
    commitment_ratio: float
    debt_ratio_before: float
    debt_ratio_after: float
    committed_ratio_before: float
    committed_ratio_after: float
    breathing_room_before: float
    breathing_room_after: float
    total_repayment: float
    total_interest: float
    comfort_status: str
    reason_codes: List[str]
    next_best_action: str
    guidance_disclaimer: str
    audit_event_id: Optional[str] = None
    audit_event: Optional[dict] = None
