from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

SpendingPriority = Literal["dining", "travel", "grocery", "everyday_bills"]
BalanceBehavior = Literal["pay_in_full", "carry_balance", "not_sure"]
SpendingFitStatus = Literal["CATEGORY_FIT_UNDETERMINED", "NOT_PROVIDED"]
MainPressureCode = Literal[
    "REWARD_VALUE_UNKNOWN",
    "INTEREST_EFFECT_UNKNOWN",
    "FEE_EXCEEDS_REWARDS",
    "FEE_REDUCES_VALUE",
    "NO_FEE_PRESSURE",
]
NudgeCode = Literal["COMPARE_REWARDS_FEE_INTEREST"]

MAX_SPENDING_PRIORITIES = 3


class MoneyValueQuickCheckRequest(BaseModel):
    monthly_card_spend: float = Field(ge=0)
    annual_card_fee: float = Field(ge=0)
    reward_rate_percent: float = Field(default=1.0, ge=0, le=20)
    revolving_balance: float = Field(default=0, ge=0)
    revolving_interest_rate_pa: float = Field(default=0.36, ge=0, le=1)
    unused_subscription_cost_monthly: float = Field(default=0, ge=0)


class MoneyValueQuickCheckResponse(BaseModel):
    estimated_annual_rewards: float
    estimated_annual_interest_cost: float
    estimated_annual_subscription_leakage: float
    estimated_net_value: float
    flags: List[str]
    explanation: str


class MoneyValueCheckRequest(BaseModel):
    """Preferred Alpha-50 public contract for Money Value Check.

    User-declared estimates only. No card number, issuer, PAN, customer ID,
    phone, email, account number, statement upload or transaction-level data.

    Unknown request fields are rejected rather than silently ignored.
    """

    model_config = ConfigDict(extra="forbid")

    monthly_card_spend: float = Field(ge=0)
    annual_card_fee: float = Field(ge=0)
    estimated_reward_rate_percent: Optional[float] = Field(default=None, ge=0)
    reward_type: Literal["cashback", "points", "miles", "not_sure"] = "cashback"
    reward_input_basis: Optional[Literal["rate_percent", "cashback_amount", "earned_units", "known_reward_value"]] = None
    reward_period: Optional[Literal["monthly", "quarterly", "yearly"]] = None
    cashback_amount: Optional[float] = Field(default=None, ge=0)
    reward_value_amount: Optional[float] = Field(default=None, ge=0)
    reward_units_earned: Optional[float] = Field(default=None, ge=0)
    rupee_value_per_reward_unit: Optional[float] = Field(default=None, gt=0)
    reward_value_unknown: bool = False
    reward_amount_is_estimate: bool = False
    interest_input_basis: Optional[Literal["no_balance", "known", "unknown"]] = None
    interest_value_unknown: bool = False
    revolving_balance: Optional[float] = Field(default=None, ge=0)
    annual_interest_rate_percent: Optional[float] = Field(default=None, ge=0)
    # Optional, additive. Older callers omit both. Neither is persisted or audited.
    spending_priorities: Optional[List[SpendingPriority]] = None
    balance_behavior: Optional[BalanceBehavior] = None

    @field_validator("spending_priorities")
    @classmethod
    def validate_spending_priorities(cls, value: Optional[List[str]]) -> Optional[List[str]]:
        if value is None:
            return None
        if not 1 <= len(value) <= MAX_SPENDING_PRIORITIES:
            raise ValueError(f"spending_priorities must contain between 1 and {MAX_SPENDING_PRIORITIES} values")
        if len(set(value)) != len(value):
            raise ValueError("spending_priorities must not contain duplicates")
        return value

    @model_validator(mode="after")
    def apply_balance_behavior(self) -> "MoneyValueCheckRequest":
        """Map the customer's balance answer onto the interest basis without inventing a cost.

        pay_in_full resolves to no_balance. carry_balance and not_sure resolve to an
        explicit unknown interest effect unless a known balance is supplied for carry_balance.
        """
        behavior = self.balance_behavior
        if behavior is None:
            return self

        if behavior == "pay_in_full":
            if self.interest_input_basis not in (None, "no_balance") or self.interest_value_unknown:
                raise ValueError("balance_behavior=pay_in_full conflicts with the interest inputs")
            if self.revolving_balance is not None and self.revolving_balance > 0:
                raise ValueError("balance_behavior=pay_in_full cannot include a revolving_balance greater than zero")
            self.interest_input_basis = "no_balance"
            return self

        if behavior == "carry_balance":
            if self.interest_input_basis == "no_balance":
                raise ValueError("balance_behavior=carry_balance conflicts with interest_input_basis=no_balance")
            if self.interest_input_basis is None and self.revolving_balance is None and self.annual_interest_rate_percent is None:
                self.interest_input_basis = "unknown"
            return self

        if self.interest_input_basis not in (None, "unknown"):
            raise ValueError("balance_behavior=not_sure conflicts with the interest inputs")
        if self.revolving_balance is not None or self.annual_interest_rate_percent is not None:
            raise ValueError("balance_behavior=not_sure cannot include balance or interest rate values")
        self.interest_input_basis = "unknown"
        return self

    @model_validator(mode="after")
    def validate_reward_fields(self) -> "MoneyValueCheckRequest":
        basis = self.reward_input_basis

        if basis is None:
            if self.estimated_reward_rate_percent is not None:
                basis = "rate_percent"
            elif self.reward_type == "cashback" and self.cashback_amount is not None:
                basis = "cashback_amount"
            elif self.reward_type in {"points", "miles"} and self.reward_value_amount is not None:
                basis = "known_reward_value"
            elif self.reward_type in {"points", "miles"} and self.reward_units_earned is not None:
                basis = "earned_units"

        if self.reward_type == "not_sure" and basis is None:
            self.reward_value_unknown = True
            return self

        if basis == "rate_percent":
            if self.estimated_reward_rate_percent is None:
                raise ValueError("estimated_reward_rate_percent is required for rate_percent basis")
            if self.cashback_amount is not None or self.reward_units_earned is not None or self.reward_value_amount is not None:
                raise ValueError("rate_percent basis cannot include cashback_amount, reward_units_earned or reward_value_amount")
            return self

        if basis == "cashback_amount":
            if self.reward_type != "cashback":
                raise ValueError("cashback_amount basis is only valid for cashback reward_type")
            if self.cashback_amount is None:
                raise ValueError("cashback_amount is required for cashback_amount basis")
            if self.reward_period is None:
                raise ValueError("reward_period is required for cashback_amount basis")
            if self.estimated_reward_rate_percent is not None or self.reward_units_earned is not None or self.reward_value_amount is not None:
                raise ValueError("cashback_amount basis cannot include estimated_reward_rate_percent, reward_units_earned or reward_value_amount")
            return self

        if basis == "known_reward_value":
            if self.reward_type not in {"points", "miles"}:
                raise ValueError("known_reward_value basis is only valid for points or miles reward_type")
            if self.reward_value_amount is None:
                raise ValueError("reward_value_amount is required for known_reward_value basis")
            if self.reward_period is None:
                raise ValueError("reward_period is required for known_reward_value basis")
            if self.estimated_reward_rate_percent is not None or self.cashback_amount is not None or self.reward_units_earned is not None:
                raise ValueError("known_reward_value basis cannot include estimated_reward_rate_percent, cashback_amount or reward_units_earned")
            return self

        if basis == "earned_units":
            if self.reward_type not in {"points", "miles"}:
                raise ValueError("earned_units basis is only valid for points or miles reward_type")
            if self.reward_units_earned is None:
                raise ValueError("reward_units_earned is required for earned_units basis")
            if self.reward_period is None:
                raise ValueError("reward_period is required for earned_units basis")
            if self.estimated_reward_rate_percent is not None or self.cashback_amount is not None or self.reward_value_amount is not None:
                raise ValueError("earned_units basis cannot include estimated_reward_rate_percent, cashback_amount or reward_value_amount")
            if not self.reward_value_unknown and self.rupee_value_per_reward_unit is None:
                raise ValueError("rupee_value_per_reward_unit is required unless reward_value_unknown is true")
            return self

        if self.reward_value_unknown:
            return self

        raise ValueError("A valid reward input is required")

    @model_validator(mode="after")
    def validate_interest_fields(self) -> "MoneyValueCheckRequest":
        basis = self.interest_input_basis

        if basis is None:
            if self.interest_value_unknown:
                basis = "unknown"
            elif self.revolving_balance is None and self.annual_interest_rate_percent is None:
                basis = "no_balance"
            else:
                basis = "known"

        if basis == "no_balance":
            self.interest_value_unknown = False
            self.revolving_balance = 0.0
            self.annual_interest_rate_percent = 0.0
            return self

        if basis == "known":
            self.interest_value_unknown = False
            if self.revolving_balance is None:
                raise ValueError("revolving_balance is required for known interest basis")
            if self.revolving_balance > 0 and self.annual_interest_rate_percent is None:
                raise ValueError("annual_interest_rate_percent is required when revolving_balance is greater than zero")
            if self.annual_interest_rate_percent is None:
                self.annual_interest_rate_percent = 0.0
            return self

        if basis == "unknown":
            self.interest_value_unknown = True
            return self

        raise ValueError("A valid interest input is required")


class MoneyValueCheckResponse(BaseModel):
    policy_version: str
    reward_type: Literal["cashback", "points", "miles", "not_sure"]
    reward_input_basis: Optional[Literal["rate_percent", "cashback_amount", "earned_units", "known_reward_value"]] = None
    reward_period: Optional[Literal["monthly", "quarterly", "yearly"]] = None
    reward_value_amount: Optional[float] = None
    annualized_reward_units: Optional[float] = None
    annual_spend: float
    estimated_annual_rewards: Optional[float] = None
    annual_card_fee: float
    interest_input_basis: Literal["no_balance", "known", "unknown"]
    interest_value_known: bool
    estimated_annual_interest_cost: Optional[float] = None
    estimated_net_annual_value: Optional[float] = None
    reward_value_known: bool
    unknown_value_reason: Optional[str] = None
    value_status: str
    reason_codes: List[str]
    next_best_action: str
    guidance_disclaimer: str
    # Additive Step 4 fields. Bounded codes and echoed non-financial inputs only, never generated prose.
    reward_amount_per_period: Optional[float] = None
    reward_units_per_period: Optional[float] = None
    spending_priorities: Optional[List[SpendingPriority]] = None
    spending_fit_status: SpendingFitStatus = "NOT_PROVIDED"
    main_pressure_code: MainPressureCode
    nudge_code: NudgeCode
    audit_event_id: str
    audit_event: Dict[str, Any]
