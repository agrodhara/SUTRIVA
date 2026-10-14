from __future__ import annotations

import os
from dataclasses import dataclass


class SavedBorrowCheckConfigError(ValueError):
    """Raised when saved-borrow-check configuration is invalid."""


def _parse_int(name: str, value: str | None, *, default: int, minimum: int, maximum: int) -> int:
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise SavedBorrowCheckConfigError(f"Invalid integer value for {name}") from exc
    if not (minimum <= parsed <= maximum):
        raise SavedBorrowCheckConfigError(f"{name} must be between {minimum} and {maximum}")
    return parsed


@dataclass(frozen=True)
class SavedBorrowCheckSettings:
    # Matches the existing anonymous-session retention convention — reused, not invented. See
    # B1_SAVED_CHECK_SPEC.md's "Retention / deletion" section.
    retention_days: int
    # How long after a visitor-initiated delete (deleted_at set) the purge job waits before hard-deleting
    # — a short grace window, not an indefinite one, so "delete" is honoured promptly without racing a
    # concurrent retrieval that was already in flight.
    delete_grace_hours: int
    purge_batch_size: int


@dataclass(frozen=True)
class SavedBorrowCheckRateLimitSettings:
    """Per-source-IP call budgets, independent of every other rate limiter in this codebase — a distinct
    v1 feature, deliberately not sharing state with the 1.1B pilot limiter or the situation-pilot-interest
    limiter."""

    save_per_ip_per_hour: int
    retrieve_per_ip_per_hour: int
    delete_per_ip_per_hour: int


def get_saved_borrow_check_settings() -> SavedBorrowCheckSettings:
    return SavedBorrowCheckSettings(
        retention_days=_parse_int("SAVED_CHECK_RETENTION_DAYS", os.getenv("SAVED_CHECK_RETENTION_DAYS"), default=90, minimum=1, maximum=3650),
        delete_grace_hours=_parse_int("SAVED_CHECK_DELETE_GRACE_HOURS", os.getenv("SAVED_CHECK_DELETE_GRACE_HOURS"), default=24, minimum=0, maximum=720),
        purge_batch_size=_parse_int("SAVED_CHECK_PURGE_BATCH_SIZE", os.getenv("SAVED_CHECK_PURGE_BATCH_SIZE"), default=500, minimum=1, maximum=10000),
    )


def get_saved_borrow_check_rate_limit_settings() -> SavedBorrowCheckRateLimitSettings:
    return SavedBorrowCheckRateLimitSettings(
        save_per_ip_per_hour=_parse_int("SAVED_CHECK_SAVE_PER_IP_PER_HOUR", os.getenv("SAVED_CHECK_SAVE_PER_IP_PER_HOUR"), default=10, minimum=1, maximum=1000),
        retrieve_per_ip_per_hour=_parse_int("SAVED_CHECK_RETRIEVE_PER_IP_PER_HOUR", os.getenv("SAVED_CHECK_RETRIEVE_PER_IP_PER_HOUR"), default=30, minimum=1, maximum=1000),
        delete_per_ip_per_hour=_parse_int("SAVED_CHECK_DELETE_PER_IP_PER_HOUR", os.getenv("SAVED_CHECK_DELETE_PER_IP_PER_HOUR"), default=10, minimum=1, maximum=1000),
    )


def get_saved_check_frontend_base_url() -> str | None:
    """The PWA origin to build a retrieval link against (e.g. https://app.sutriva.com). No default — an
    unset value means an email cannot be composed with a valid link, so the save flow must fail closed
    rather than send a broken or locally-scoped URL to a real visitor."""
    value = os.getenv("SAVED_CHECK_FRONTEND_BASE_URL")
    return value.rstrip("/") if value else None
