from __future__ import annotations

import os
from dataclasses import dataclass


class PilotConfigError(ValueError):
    """Raised when pilot/OTP configuration is invalid."""


@dataclass(frozen=True)
class PilotOtpSettings:
    code_length: int
    code_ttl_seconds: int
    resend_cooldown_seconds: int
    max_attempts: int
    sms_provider: str


def _parse_int(name: str, value: str | None, *, default: int, minimum: int, maximum: int) -> int:
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise PilotConfigError(f"Invalid integer value for {name}") from exc
    if not (minimum <= parsed <= maximum):
        raise PilotConfigError(f"{name} must be between {minimum} and {maximum}")
    return parsed


def get_pilot_otp_settings() -> PilotOtpSettings:
    return PilotOtpSettings(
        code_length=_parse_int("PILOT_OTP_CODE_LENGTH", os.getenv("PILOT_OTP_CODE_LENGTH"), default=6, minimum=4, maximum=8),
        code_ttl_seconds=_parse_int("PILOT_OTP_TTL_SECONDS", os.getenv("PILOT_OTP_TTL_SECONDS"), default=600, minimum=60, maximum=1800),
        resend_cooldown_seconds=_parse_int(
            "PILOT_OTP_RESEND_COOLDOWN_SECONDS", os.getenv("PILOT_OTP_RESEND_COOLDOWN_SECONDS"), default=30, minimum=10, maximum=300
        ),
        max_attempts=_parse_int("PILOT_OTP_MAX_ATTEMPTS", os.getenv("PILOT_OTP_MAX_ATTEMPTS"), default=5, minimum=3, maximum=10),
        # No default: an unset provider must fail closed (see app/services/sms.py), never silently
        # substitute a fake or unverified sender.
        sms_provider=(os.getenv("PILOT_SMS_PROVIDER") or "").strip().lower(),
    )
