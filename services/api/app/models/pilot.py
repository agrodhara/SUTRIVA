from __future__ import annotations

import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PilotJourneyType = Literal["money_value", "comfortable_borrowing"]

_PHONE_PATTERN = re.compile(r"^\+[1-9][0-9]{7,14}$")


class PilotInterestRequest(BaseModel):
    """Step 6A: an anonymous interest click only. No phone, OTP, identity or permission field exists on
    this model by design — Step 6A must not be able to collect any of those, not just choose not to."""

    model_config = ConfigDict(extra="forbid")

    journey: PilotJourneyType
    journey_run_id: str | None = Field(default=None, min_length=1, max_length=128)


class PilotInterestResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pilot_registration_id: str
    status: Literal["interest_clicked"]


class PilotMobileSubmitRequest(BaseModel):
    """Step 6B start: mobile number only. `optional_updates_opted_in` defaults to False and must be
    explicitly set true by the caller — it is never inferred from submitting a phone number."""

    model_config = ConfigDict(extra="forbid")

    pilot_registration_id: str = Field(min_length=1)
    phone_number: str
    optional_updates_opted_in: bool = False

    @field_validator("phone_number")
    @classmethod
    def validate_phone_number(cls, value: str) -> str:
        if not _PHONE_PATTERN.fullmatch(value):
            raise ValueError("phone_number must be in E.164 format, e.g. +919876543210")
        return value


class PilotMobileSubmitResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["otp_sent"]
    expires_at: datetime
    resend_after_seconds: int


class PilotOtpVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pilot_registration_id: str = Field(min_length=1)
    code: str = Field(min_length=4, max_length=8)

    @field_validator("code")
    @classmethod
    def validate_code_digits(cls, value: str) -> str:
        if not value.isdigit():
            raise ValueError("code must be numeric")
        return value


class PilotOtpVerifyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["verified"]


class PilotOtpResendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pilot_registration_id: str = Field(min_length=1)


class PilotErrorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    detail: Literal[
        "pilot_registration_not_found",
        "invalid_code",
        "code_expired",
        "too_many_attempts",
        "resend_too_soon",
        "already_verified",
        "sms_provider_not_configured",
        "feature_disabled",
    ]
