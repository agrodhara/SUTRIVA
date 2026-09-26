from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.services.situations import SituationBar, SituationResult

# A shared response shape for every situation: the frontend renders it identically regardless of which
# situation produced it, and decides the provenance badge (example / mixed / own) itself from its own
# input-editing state, never from anything this response carries.


class SituationBarOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    value: float | None
    tone: str


class SituationResultOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    headline: str
    detail: str
    insight: str
    scenario: str
    note: str
    bars: list[SituationBarOut]


def situation_result_to_response(result: SituationResult) -> SituationResultOut:
    return SituationResultOut(
        title=result.title,
        headline=result.headline,
        detail=result.detail,
        insight=result.insight,
        scenario=result.scenario,
        note=result.note,
        bars=[SituationBarOut(label=b.label, value=b.value, tone=b.tone) for b in result.bars],
    )


# --- Borrow Better ---------------------------------------------------------------------------------


class RisingEmisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    income: float = Field(ge=0)
    essentials: float = Field(ge=0)
    emis: float = Field(ge=0)
    overdue: Literal["no", "yes", "not_sure"]


class NewPurchaseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    price: float = Field(ge=0)
    down: float = Field(ge=0)
    emi: float = Field(ge=0)
    months: int = Field(gt=0)
    income: float = Field(ge=0)
    costs: float = Field(ge=0)


class LoanOfferRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    principal: float = Field(ge=0)
    emi: float = Field(ge=0)
    months: int = Field(gt=0)
    income: float = Field(ge=0)
    costs: float = Field(ge=0)


class RejectedShortfallRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    emi: float = Field(ge=0)
    income: float = Field(ge=0)
    costs: float = Field(ge=0)


# --- Rewards Intelligence ---------------------------------------------------------------------------


class AnnualFeeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    redeemed: float = Field(ge=0)
    fee: float = Field(ge=0)
    interest: float | None = Field(default=None, ge=0)


class CardFitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    category: Literal["groceries", "travel", "online shopping", "fuel", "other"]
    spend: float = Field(ge=0)


class CarryingBalanceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    known: Literal["yes", "no"]
    interest: float | None = Field(default=None, ge=0)
    rewards: float = Field(ge=0)


class MultiCardRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fee1: float = Field(ge=0)
    reward1: float = Field(ge=0)
    fee2: float = Field(ge=0)
    reward2: float = Field(ge=0)


class UnusedPointsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    points: float = Field(ge=0)
    value: float | None = Field(default=None, ge=0)
    fee: float | None = Field(default=None, ge=0)
