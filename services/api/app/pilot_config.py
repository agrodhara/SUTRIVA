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
    # Ordered newest-first: [0] signs every newly generated code; every key in the tuple is still tried
    # when *verifying* a code, so a key can be rotated without invalidating codes already in flight. To
    # rotate: prepend the new key to PILOT_OTP_HMAC_KEYS (comma-separated). Keep the old key in the list
    # until every code hashed under it has expired — at most code_ttl_seconds after issuance — then drop
    # it. Empty when unset; see app/services/pilot.py's PilotOtpKeyNotConfiguredError for the fail-closed
    # behavior this produces (mirrors sms_provider below).
    hmac_keys: tuple[str, ...]
    # Hard ceilings on how many codes one registration, or one phone number across every registration
    # that has ever named it, may be sent. Enforced in app/services/pilot.py so a resend cooldown or a
    # fresh Step 6A/6B registration can never be used to grant unlimited further sends.
    max_sends_per_registration: int
    max_sends_per_phone: int
    phone_send_window_hours: int


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


def _parse_hmac_keys(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    return tuple(key.strip() for key in value.split(",") if key.strip())


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
        # No default here either, for the same reason: a code hashed with no keyed secret is a bare
        # SHA-256 of a 6-digit space, trivially reversible offline from a stolen database row. See
        # app/services/pilot.py.
        hmac_keys=_parse_hmac_keys(os.getenv("PILOT_OTP_HMAC_KEYS")),
        max_sends_per_registration=_parse_int(
            "PILOT_OTP_MAX_SENDS_PER_REGISTRATION", os.getenv("PILOT_OTP_MAX_SENDS_PER_REGISTRATION"), default=5, minimum=1, maximum=20
        ),
        max_sends_per_phone=_parse_int(
            "PILOT_OTP_MAX_SENDS_PER_PHONE", os.getenv("PILOT_OTP_MAX_SENDS_PER_PHONE"), default=8, minimum=1, maximum=50
        ),
        phone_send_window_hours=_parse_int(
            "PILOT_OTP_PHONE_SEND_WINDOW_HOURS", os.getenv("PILOT_OTP_PHONE_SEND_WINDOW_HOURS"), default=24, minimum=1, maximum=168
        ),
    )


@dataclass(frozen=True)
class PilotRateLimitSettings:
    """Per-source-IP call budgets for the pilot endpoints — a source-level abuse control layered on top of
    the per-registration and per-phone-number limits above. See app/services/pilot_rate_limit.py for why
    this is process-local and what it does not protect against by itself."""

    interest_per_ip_per_hour: int
    mobile_per_ip_per_hour: int
    verify_per_ip_per_hour: int


def get_pilot_rate_limit_settings() -> PilotRateLimitSettings:
    return PilotRateLimitSettings(
        interest_per_ip_per_hour=_parse_int(
            "PILOT_RATE_LIMIT_INTEREST_PER_IP_PER_HOUR", os.getenv("PILOT_RATE_LIMIT_INTEREST_PER_IP_PER_HOUR"), default=20, minimum=1, maximum=1000
        ),
        mobile_per_ip_per_hour=_parse_int(
            "PILOT_RATE_LIMIT_MOBILE_PER_IP_PER_HOUR", os.getenv("PILOT_RATE_LIMIT_MOBILE_PER_IP_PER_HOUR"), default=10, minimum=1, maximum=1000
        ),
        verify_per_ip_per_hour=_parse_int(
            "PILOT_RATE_LIMIT_VERIFY_PER_IP_PER_HOUR", os.getenv("PILOT_RATE_LIMIT_VERIFY_PER_IP_PER_HOUR"), default=30, minimum=1, maximum=1000
        ),
    )
