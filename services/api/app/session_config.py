from __future__ import annotations

import os
from dataclasses import dataclass


class SessionConfigError(ValueError):
    """Raised when anonymous-session configuration is invalid."""


_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}

_DEFAULT_PRODUCTION_ORIGIN = "https://app.sutriva.com"
_DEFAULT_LOCAL_ORIGINS = (
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:3001",
)


@dataclass(frozen=True, repr=False)
class AnonymousSessionSettings:
    cookie_name: str
    cookie_secure: bool
    cookie_same_site: str
    cookie_path: str
    cookie_max_age_seconds: int
    absolute_session_lifetime_seconds: int
    history_retention_seconds: int
    token_retention_seconds: int
    token_grace_period_seconds: int
    allowed_origins: tuple[str, ...]
    allow_credentials: bool
    purge_batch_size: int

    def __repr__(self) -> str:
        return (
            "AnonymousSessionSettings("
            f"cookie_name={self.cookie_name!r}, "
            f"cookie_secure={self.cookie_secure}, "
            f"cookie_same_site={self.cookie_same_site!r}, "
            f"cookie_path={self.cookie_path!r}, "
            f"cookie_max_age_seconds={self.cookie_max_age_seconds}, "
            f"absolute_session_lifetime_seconds={self.absolute_session_lifetime_seconds}, "
            f"history_retention_seconds={self.history_retention_seconds}, "
            f"token_retention_seconds={self.token_retention_seconds}, "
            f"token_grace_period_seconds={self.token_grace_period_seconds}, "
            f"allowed_origins={self.allowed_origins!r}, "
            f"allow_credentials={self.allow_credentials}, "
            f"purge_batch_size={self.purge_batch_size}"
            ")"
        )

    __str__ = __repr__


def _parse_bool(name: str, value: str | None, *, default: bool) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    raise SessionConfigError(f"Invalid boolean value for {name}")


def _parse_int(
    name: str,
    value: str | None,
    *,
    default: int,
    minimum: int,
    maximum: int | None = None,
) -> int:
    if value is None:
        return default
    try:
        parsed = int(value)
    except ValueError as exc:
        raise SessionConfigError(f"Invalid integer value for {name}") from exc
    if parsed < minimum:
        raise SessionConfigError(f"{name} must be >= {minimum}")
    if maximum is not None and parsed > maximum:
        raise SessionConfigError(f"{name} must be <= {maximum}")
    return parsed


def _parse_allowed_origins(value: str | None) -> tuple[str, ...]:
    raw = value or ",".join(_DEFAULT_LOCAL_ORIGINS)
    origins = tuple(origin.strip() for origin in raw.split(",") if origin.strip())
    if not origins:
        raise SessionConfigError("ANONYMOUS_SESSION_ALLOWED_ORIGINS must not be empty")
    if "*" in origins:
        raise SessionConfigError("Wildcard origins are not allowed for anonymous sessions")
    return origins


def get_anonymous_session_settings() -> AnonymousSessionSettings:
    insecure_local_cookie = _parse_bool(
        "ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST",
        os.getenv("ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST"),
        default=False,
    )

    production_origin = os.getenv("ANONYMOUS_SESSION_PRODUCTION_ORIGIN", _DEFAULT_PRODUCTION_ORIGIN).strip()
    if not production_origin:
        raise SessionConfigError("ANONYMOUS_SESSION_PRODUCTION_ORIGIN must not be empty")

    allowed_origins = _parse_allowed_origins(os.getenv("ANONYMOUS_SESSION_ALLOWED_ORIGINS"))
    if production_origin not in allowed_origins and allowed_origins != _DEFAULT_LOCAL_ORIGINS:
        raise SessionConfigError("ANONYMOUS_SESSION_ALLOWED_ORIGINS must include the production origin")

    cookie_name = os.getenv("ANONYMOUS_SESSION_COOKIE_NAME", "sutriva_anon_session").strip()
    if not cookie_name:
        raise SessionConfigError("ANONYMOUS_SESSION_COOKIE_NAME must not be empty")

    cookie_same_site = os.getenv("ANONYMOUS_SESSION_COOKIE_SAMESITE", "lax").strip().lower()
    if cookie_same_site != "lax":
        raise SessionConfigError("ANONYMOUS_SESSION_COOKIE_SAMESITE must be 'lax'")

    cookie_path = os.getenv("ANONYMOUS_SESSION_COOKIE_PATH", "/").strip()
    if cookie_path != "/":
        raise SessionConfigError("ANONYMOUS_SESSION_COOKIE_PATH must be '/'")

    cookie_max_age_seconds = _parse_int(
        "ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS",
        os.getenv("ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS"),
        default=7_776_000,
        minimum=7_776_000,
        maximum=7_776_000,
    )

    absolute_session_lifetime_seconds = _parse_int(
        "ANONYMOUS_SESSION_ABSOLUTE_LIFETIME_SECONDS",
        os.getenv("ANONYMOUS_SESSION_ABSOLUTE_LIFETIME_SECONDS"),
        default=7_776_000,
        minimum=7_776_000,
        maximum=7_776_000,
    )

    history_retention_seconds = _parse_int(
        "ANONYMOUS_HISTORY_RETENTION_SECONDS",
        os.getenv("ANONYMOUS_HISTORY_RETENTION_SECONDS"),
        default=15_552_000,
        minimum=15_552_000,
        maximum=15_552_000,
    )

    token_retention_seconds = _parse_int(
        "ANONYMOUS_TOKEN_RETENTION_SECONDS",
        os.getenv("ANONYMOUS_TOKEN_RETENTION_SECONDS"),
        default=15_552_000,
        minimum=15_552_000,
        maximum=15_552_000,
    )

    token_grace_period_seconds = _parse_int(
        "ANONYMOUS_SESSION_TOKEN_GRACE_PERIOD_SECONDS",
        os.getenv("ANONYMOUS_SESSION_TOKEN_GRACE_PERIOD_SECONDS"),
        default=300,
        minimum=1,
        maximum=600,
    )

    purge_batch_size = _parse_int(
        "ANONYMOUS_RETENTION_PURGE_BATCH_SIZE",
        os.getenv("ANONYMOUS_RETENTION_PURGE_BATCH_SIZE"),
        default=500,
        minimum=1,
        maximum=5_000,
    )

    return AnonymousSessionSettings(
        cookie_name=cookie_name,
        cookie_secure=not insecure_local_cookie,
        cookie_same_site="lax",
        cookie_path="/",
        cookie_max_age_seconds=cookie_max_age_seconds,
        absolute_session_lifetime_seconds=absolute_session_lifetime_seconds,
        history_retention_seconds=history_retention_seconds,
        token_retention_seconds=token_retention_seconds,
        token_grace_period_seconds=token_grace_period_seconds,
        allowed_origins=allowed_origins,
        allow_credentials=True,
        purge_batch_size=purge_batch_size,
    )