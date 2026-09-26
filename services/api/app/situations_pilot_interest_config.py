from __future__ import annotations

import os
from dataclasses import dataclass


class SituationPilotInterestConfigError(ValueError):
    """Raised when situation pilot-interest configuration is invalid."""


def _parse_int(name: str, value: str | None, *, default: int, minimum: int, maximum: int) -> int:
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise SituationPilotInterestConfigError(f"Invalid integer value for {name}") from exc
    if not (minimum <= parsed <= maximum):
        raise SituationPilotInterestConfigError(f"{name} must be between {minimum} and {maximum}")
    return parsed


@dataclass(frozen=True)
class SituationPilotInterestRateLimitSettings:
    """Per-source-IP call budgets for the situation pilot-interest endpoints — a source-level abuse
    control, independent of the Phase 1.1B pilot rate limiter in app/pilot_config.py. This is a distinct
    1.1A feature (an anonymous email interest capture) and deliberately does not share state, config or
    semantics with the Phase 1.1B phone/OTP pilot handoff."""

    submit_per_ip_per_hour: int
    admin_export_per_ip_per_hour: int


def get_situation_pilot_interest_rate_limit_settings() -> SituationPilotInterestRateLimitSettings:
    return SituationPilotInterestRateLimitSettings(
        submit_per_ip_per_hour=_parse_int(
            "SITUATION_PILOT_INTEREST_SUBMIT_PER_IP_PER_HOUR",
            os.getenv("SITUATION_PILOT_INTEREST_SUBMIT_PER_IP_PER_HOUR"),
            default=10,
            minimum=1,
            maximum=1000,
        ),
        admin_export_per_ip_per_hour=_parse_int(
            "SITUATION_PILOT_INTEREST_ADMIN_EXPORT_PER_IP_PER_HOUR",
            os.getenv("SITUATION_PILOT_INTEREST_ADMIN_EXPORT_PER_IP_PER_HOUR"),
            default=60,
            minimum=1,
            maximum=1000,
        ),
    )


def get_situation_pilot_interest_admin_token() -> str | None:
    """The shared secret an operator must present (in an `X-Admin-Token` header) to retrieve the interest
    list. No default: unset means the export route is unavailable, not open — see
    app/routers/situation_pilot_interest.py's `_require_admin_token`, which fails closed (404) exactly
    like an unconfigured SMS provider or OTP signing key does elsewhere in this codebase."""
    token = os.getenv("SITUATION_PILOT_INTEREST_ADMIN_TOKEN")
    return token if token else None
