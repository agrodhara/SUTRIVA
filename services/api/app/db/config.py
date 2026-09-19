from __future__ import annotations

import os
from dataclasses import dataclass

from sqlalchemy.engine.url import make_url


class DatabaseConfigError(ValueError):
    """Raised when database configuration is invalid."""


class DatabaseNotConfiguredError(DatabaseConfigError):
    """Raised when a required database URL is not configured."""


@dataclass(frozen=True, repr=False)
class DatabaseSettings:
    database_url: str | None
    database_required: bool
    pool_size: int
    max_overflow: int
    pool_timeout: int
    pool_recycle: int
    connect_timeout: int

    def __repr__(self) -> str:
        return (
            "DatabaseSettings("
            f"database_configured={self.database_url is not None}, "
            f"database_required={self.database_required}, "
            f"pool_size={self.pool_size}, "
            f"max_overflow={self.max_overflow}, "
            f"pool_timeout={self.pool_timeout}, "
            f"pool_recycle={self.pool_recycle}, "
            f"connect_timeout={self.connect_timeout}"
            ")"
        )

    __str__ = __repr__


_TRUE_VALUES = {"1", "true", "yes", "on"}
_FALSE_VALUES = {"0", "false", "no", "off"}


def _parse_bool(name: str, value: str | None, *, default: bool) -> bool:
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in _TRUE_VALUES:
        return True
    if normalized in _FALSE_VALUES:
        return False
    raise DatabaseConfigError(f"Invalid boolean value for {name}")


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
        raise DatabaseConfigError(f"Invalid integer value for {name}") from exc
    if parsed < minimum:
        raise DatabaseConfigError(f"{name} must be >= {minimum}")
    if maximum is not None and parsed > maximum:
        raise DatabaseConfigError(f"{name} must be <= {maximum}")
    return parsed


def _validate_database_url(raw_url: str) -> str:
    try:
        parsed = make_url(raw_url)
    except Exception:  # pragma: no cover - SQLAlchemy parser handles detail
        raise DatabaseConfigError("Invalid DATABASE_URL") from None

    if parsed.get_backend_name() not in {"postgresql", "postgresql+psycopg", "postgresql+psycopg2"}:
        raise DatabaseConfigError("DATABASE_URL must use a PostgreSQL dialect")
    if not parsed.database:
        raise DatabaseConfigError("DATABASE_URL must include a database name")
    # Preserve credentials in the runtime DSN; str(parsed) masks passwords as ***.
    return parsed.render_as_string(hide_password=False)


def get_database_settings() -> DatabaseSettings:
    required = _parse_bool("DATABASE_REQUIRED", os.getenv("DATABASE_REQUIRED"), default=False)
    raw_url = os.getenv("DATABASE_URL")
    database_url = _validate_database_url(raw_url) if raw_url else None

    if required and not database_url:
        raise DatabaseNotConfiguredError("DATABASE_URL is required when DATABASE_REQUIRED=true")

    return DatabaseSettings(
        database_url=database_url,
        database_required=required,
        pool_size=_parse_int("DATABASE_POOL_SIZE", os.getenv("DATABASE_POOL_SIZE"), default=5, minimum=1),
        max_overflow=_parse_int("DATABASE_MAX_OVERFLOW", os.getenv("DATABASE_MAX_OVERFLOW"), default=5, minimum=0),
        pool_timeout=_parse_int("DATABASE_POOL_TIMEOUT", os.getenv("DATABASE_POOL_TIMEOUT"), default=10, minimum=1),
        pool_recycle=_parse_int("DATABASE_POOL_RECYCLE", os.getenv("DATABASE_POOL_RECYCLE"), default=1800, minimum=1),
        connect_timeout=_parse_int(
            "DATABASE_CONNECT_TIMEOUT",
            os.getenv("DATABASE_CONNECT_TIMEOUT"),
            default=3,
            minimum=1,
            maximum=30,
        ),
    )


def get_database_url(settings: DatabaseSettings | None = None) -> str | None:
    current = settings or get_database_settings()
    return current.database_url


def require_database_url(settings: DatabaseSettings | None = None) -> str:
    current = settings or get_database_settings()
    if current.database_url:
        return current.database_url
    raise DatabaseNotConfiguredError("DATABASE_URL is not configured")
