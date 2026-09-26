from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

# The nine narrow Phase 1.1A situation checks, by their short frontend key (see
# apps/pwa/app/situations/situationsConfig.ts's SituationKey). Deliberately the short key, not the
# analytics layer's prefixed screen_name — this model is the request contract for a customer-facing form,
# not an analytics event.
SituationKeyType = Literal["debt", "purchase", "offer", "rejected", "fee", "fit", "balance", "multi", "unused"]

BORROW_SITUATION_KEYS: tuple[SituationKeyType, ...] = ("debt", "purchase", "offer", "rejected")
REWARDS_SITUATION_KEYS: tuple[SituationKeyType, ...] = ("fee", "fit", "balance", "multi", "unused")

# A deliberately simple, dependency-free email shape check (this codebase has no email-validator
# dependency — see requirements.txt — and adding one for a single regex-shaped field was judged not
# worth a new third-party dependency). It rejects obviously-malformed input; it does not and cannot
# guarantee deliverability, which no static check can.
_EMAIL_PATTERN = re.compile(r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$")
_EMAIL_MAX_LENGTH = 254
_EMAIL_LOCAL_PART_MAX_LENGTH = 64


class PilotInterestEmailRequest(BaseModel):
    """The one field this form may ever collect, alongside which situation it was shown for. No name,
    phone number, consent checkbox or any other field exists on this model by design, mirroring how
    app/models/pilot.py's PilotInterestRequest is deliberately minimal for its own step. `journey` is not
    accepted from the client: it is derived server-side from `situation_key` (see
    app/services/situation_pilot_interest.py's SITUATION_JOURNEY), so a caller cannot desynchronize the
    two."""

    model_config = ConfigDict(extra="forbid")

    situation_key: SituationKeyType
    email: str = Field(min_length=3, max_length=_EMAIL_MAX_LENGTH)

    @field_validator("email")
    @classmethod
    def validate_and_normalize_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized or len(normalized) > _EMAIL_MAX_LENGTH:
            raise ValueError("email is invalid")
        local_part = normalized.split("@", 1)[0]
        if len(local_part) > _EMAIL_LOCAL_PART_MAX_LENGTH:
            raise ValueError("email is invalid")
        if not _EMAIL_PATTERN.fullmatch(normalized):
            raise ValueError("email is invalid")
        return normalized


class PilotInterestEmailResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Both outcomes show the visitor the identical agreed confirmation copy (see PilotInterestForm.tsx) —
    # this distinction exists only so the service and its tests can tell a fresh registration from a
    # harmless resubmission of the same email for the same situation.
    status: Literal["registered", "already_registered"]


class PilotInterestErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: Literal[
        "invalid_origin",
        "rate_limited",
        "feature_disabled",
        "service_unavailable",
    ]


class PilotInterestAdminRow(BaseModel):
    model_config = ConfigDict(extra="forbid")

    situation_pilot_interest_uuid: str
    journey: Literal["money_value", "comfortable_borrowing"]
    situation_key: SituationKeyType
    email: str
    created_at: datetime


class PilotInterestAdminExportResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rows: list[PilotInterestAdminRow]
