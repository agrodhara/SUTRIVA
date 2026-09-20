from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.config import borrow_illustrative_annual_rate_percent

MonthEndPosition = Literal["money_left", "break_even", "fall_short", "not_sure"]
LoanPurpose = Literal[
    "home_improvement",
    "education",
    "medical",
    "debt_consolidation",
    "vehicle",
    "household_purchase",
    "other",
]
EmiEndingAnswer = Literal["yes", "no", "not_sure"]
ReconciliationNote = Literal["MONTH_END_FALL_SHORT", "MONTH_END_POSITION_UNKNOWN"]
EmiEndingNote = Literal["EMI_MAY_END_WITHIN_SIX_MONTHS"]
MainPressureCode = Literal["PROPOSED_EMI_REDUCES_BREATHING_ROOM"]

# The configured rate is policy-controlled. A client may echo it back but never change it.
_RATE_MATCH_TOLERANCE = 1e-9


def _rate_matches_policy(client_rate: float, policy_rate: float) -> bool:
    return abs(client_rate - policy_rate) <= _RATE_MATCH_TOLERANCE


class ComfortableBorrowingCheckRequest(BaseModel):
    # Unsupported fields are rejected rather than silently dropped.
    model_config = ConfigDict(extra="forbid")

    calculation_mode: Optional[Literal["legacy_total_commitments", "track_11a_breakdown"]] = None
    monthly_income: float = Field(gt=0)
    existing_debt_payments: Optional[float] = Field(default=None, ge=0)
    existing_monthly_commitments: Optional[float] = Field(default=None, ge=0)
    housing_rent: Optional[float] = Field(default=None, ge=0)
    household_utilities: Optional[float] = Field(default=None, ge=0)
    dependants_education: Optional[float] = Field(default=None, ge=0)
    recurring_medical_insurance: Optional[float] = Field(default=None, ge=0)
    # Legacy field. Accepted for existing callers; the final 1.1A journey does not collect it.
    other_essential_commitments: Optional[float] = Field(default=None, ge=0)
    desired_borrowing_amount: float = Field(gt=0)
    desired_tenure_months: int = Field(ge=1, le=360)
    # Accepted only when omitted or exactly equal to the configured policy rate.
    illustrative_annual_rate_percent: Optional[float] = Field(default=None, ge=0, le=100)
    income_verified: bool = False
    # Declared context. Descriptive only: none of these change the numeric affordability calculation.
    month_end_position: Optional[MonthEndPosition] = None
    loan_purpose: Optional[LoanPurpose] = None
    existing_emi_ending_within_six_months: Optional[EmiEndingAnswer] = None

    @model_validator(mode="after")
    def validate_existing_debt_payments(self) -> "ComfortableBorrowingCheckRequest":
        policy_rate = borrow_illustrative_annual_rate_percent()
        if self.illustrative_annual_rate_percent is not None and not _rate_matches_policy(
            self.illustrative_annual_rate_percent, policy_rate
        ):
            raise ValueError("illustrative_annual_rate_percent is configured by policy and cannot be changed")
        self.illustrative_annual_rate_percent = policy_rate

        visible_grouped_values = [
            self.housing_rent,
            self.household_utilities,
            self.dependants_education,
            self.recurring_medical_insurance,
        ]
        has_any_grouped = any(value is not None for value in visible_grouped_values) or self.other_essential_commitments is not None
        has_all_visible_grouped = all(value is not None for value in visible_grouped_values)

        if self.calculation_mode is None:
            if self.existing_monthly_commitments is not None and self.existing_debt_payments is None and not has_any_grouped:
                self.calculation_mode = "legacy_total_commitments"
            elif self.existing_debt_payments is not None and self.existing_monthly_commitments is None and has_all_visible_grouped:
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
        if not has_all_visible_grouped:
            raise ValueError("all grouped non-debt commitment fields are required for track_11a_breakdown")
        if self.other_essential_commitments is None:
            # Legacy fifth category is optional; absent means it was not part of the declared position.
            self.other_essential_commitments = 0.0
        return self


class MainPressure(BaseModel):
    code: MainPressureCode
    # Monthly amount by which the proposed EMI reduces breathing room. Backend-computed.
    monthly_amount: float


class LoanReductionNudge(BaseModel):
    # Fixed reduction that was evaluated, and the monthly EMI difference it would preserve.
    reduction_amount: float
    monthly_breathing_room_preserved: float


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
    main_pressure: MainPressure
    loan_reduction_nudge: Optional[LoanReductionNudge] = None
    reconciliation_note: Optional[ReconciliationNote] = None
    emi_ending_note: Optional[EmiEndingNote] = None
    comfort_status: str
    reason_codes: List[str]
    next_best_action: str
    guidance_disclaimer: str
    audit_event_id: Optional[str] = None
    audit_event: Optional[dict] = None


class EmiPreviewRequest(BaseModel):
    # No rate field: the rate is policy-controlled and unknown fields are rejected.
    model_config = ConfigDict(extra="forbid")

    desired_borrowing_amount: float = Field(gt=0)
    desired_tenure_months: int = Field(ge=1, le=360)


class EmiPreviewResponse(BaseModel):
    illustrative_annual_rate_percent: float
    estimated_monthly_emi: float
    guidance_disclaimer: str
