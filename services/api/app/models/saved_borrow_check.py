from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.situations import (
    LoanOfferRequest,
    NewPurchaseRequest,
    RejectedShortfallRequest,
    RisingEmisRequest,
    SituationBarOut,
)

# B1-only for v1 — see B1_SAVED_CHECK_SPEC.md's explicit scope note. Mirrors
# app/models/situation_pilot_interest.py's BORROW_SITUATION_KEYS exactly.
SavedCheckSituationKeyType = Literal["debt", "purchase", "offer", "rejected"]

ProvenanceType = Literal["example", "mixed", "own"]

# The one input-request model per B1 situation key, reused from the live-calculation routes rather than
# inventing a parallel validation scheme — a saved check's input_values must satisfy the exact same shape
# the live /v1/borrow-better/* routes already require. See app/routers/situations.py for the live routes
# these mirror.
_SITUATION_INPUT_MODELS: dict[SavedCheckSituationKeyType, type[BaseModel]] = {
    "debt": RisingEmisRequest,
    "purchase": NewPurchaseRequest,
    "offer": LoanOfferRequest,
    "rejected": RejectedShortfallRequest,
}

# Same dependency-free email shape check as app/models/situation_pilot_interest.py — deliberately
# duplicated rather than imported, so the two features' validation can evolve independently without one
# silently changing the other's behavior.
_EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
_EMAIL_MAX_LENGTH = 254
_EMAIL_LOCAL_PART_MAX_LENGTH = 64


def _normalize_email(value: str) -> str:
    normalized = value.strip().lower()
    if not normalized or len(normalized) > _EMAIL_MAX_LENGTH:
        raise ValueError("email is invalid")
    local_part = normalized.split("@", 1)[0]
    if len(local_part) > _EMAIL_LOCAL_PART_MAX_LENGTH:
        raise ValueError("email is invalid")
    if not _EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("email is invalid")
    return normalized


class SaveBorrowCheckRequest(BaseModel):
    """What the result screen submits when a visitor asks to save a check. `input_values` and `provenance`
    must be exactly what produced the result currently on screen — the service layer re-validates
    `input_values` against the matching situation's own request model (never accepted as free-form) and
    recomputes nothing: the result fields below are stored as given, not re-derived server-side, matching
    the spec's "never recalculated on save or retrieval" rule.
    """

    model_config = ConfigDict(extra="forbid")

    situation_key: SavedCheckSituationKeyType
    input_values: dict[str, float | int | str | None]
    provenance: ProvenanceType
    result_title: str = Field(min_length=1, max_length=2000)
    result_headline: str = Field(min_length=1, max_length=2000)
    result_detail: str = Field(min_length=1, max_length=2000)
    result_insight: str = Field(min_length=1, max_length=2000)
    result_scenario: str = Field(min_length=1, max_length=2000)
    result_note: str = Field(min_length=1, max_length=2000)
    result_bars: list[SituationBarOut]
    email: str = Field(min_length=3, max_length=_EMAIL_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def validate_and_normalize_email(cls, value: str) -> str:
        return _normalize_email(value)

    def validated_input_values(self) -> dict[str, float | int | str | None]:
        """Re-validates input_values against the exact Pydantic model the live calculation for this
        situation already uses. Raises pydantic.ValidationError (caught by the router as a 422) if the
        submitted values don't match what a real calculation for this situation could have produced —
        this is what keeps input_values from ever being accepted as free-form JSON.
        """
        model = _SITUATION_INPUT_MODELS[self.situation_key]
        validated = model.model_validate(self.input_values)
        return validated.model_dump()


class SaveBorrowCheckResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["saved"]


class SavedBorrowCheckOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    situation_key: SavedCheckSituationKeyType
    input_values: dict[str, float | int | str | None]
    provenance: ProvenanceType
    result_title: str
    result_headline: str
    result_detail: str
    result_insight: str
    result_scenario: str
    result_note: str
    result_bars: list[SituationBarOut]
    created_at: datetime


class DeleteSavedBorrowCheckResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["deleted"]
