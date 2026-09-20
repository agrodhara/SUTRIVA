from __future__ import annotations

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone

from fastapi import HTTPException, Response, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.config import DatabaseConfigError, DatabaseNotConfiguredError, get_database_settings
from app.db.session import get_session_factory
from app.repositories.anonymous_continuity import (
    ValidatedSessionRecord,
    convert_primary_token_to_grace,
    create_anonymous_session,
    expire_anonymous_session,
    insert_token,
    load_active_tokens_for_session,
    load_locked_session_for_token,
    revoke_anonymous_session,
    revoke_existing_grace_tokens,
    touch_anonymous_session,
)
from app.session_config import AnonymousSessionSettings, get_anonymous_session_settings


LOGGER = logging.getLogger(__name__)
_SESSION_COOKIE_ERROR = "anonymous_session_unavailable"


@dataclass(frozen=True)
class BootstrapResult:
    session_status: str
    absolute_expires_at: datetime
    cookie_max_age_seconds: int
    raw_token: str | None = None


@dataclass(frozen=True)
class ValidatedAnonymousSession:
    anonymous_session_uuid: str
    absolute_expires_at: datetime


class AnonymousSessionHttpError(Exception):
    def __init__(self, status_code: int, code: str, *, clear_cookie: bool = False) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code
        self.clear_cookie = clear_cookie


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _generate_token() -> str:
    return secrets.token_urlsafe(32)


def _token_digest(raw_token: str) -> bytes:
    return hashlib.sha256(raw_token.encode("utf-8")).digest()


def _session_factory():
    settings = get_database_settings()
    return get_session_factory(settings)


def get_cookie_name() -> str:
    return get_anonymous_session_settings().cookie_name


def validate_request_origin(origin: str | None, settings: AnonymousSessionSettings | None = None) -> None:
    current = settings or get_anonymous_session_settings()
    if not origin or origin not in current.allowed_origins:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid_origin")


def apply_session_cookie(response: Response, raw_token: str, absolute_expires_at: datetime) -> None:
    settings = get_anonymous_session_settings()
    expires_at = absolute_expires_at.astimezone(timezone.utc)
    response.set_cookie(
        key=settings.cookie_name,
        value=raw_token,
        max_age=settings.cookie_max_age_seconds,
        expires=expires_at,
        path=settings.cookie_path,
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_same_site,
    )


def clear_session_cookie(response: Response) -> None:
    settings = get_anonymous_session_settings()
    response.delete_cookie(key=settings.cookie_name, path=settings.cookie_path)


def _create_session_and_token(db: Session, settings: AnonymousSessionSettings, now: datetime) -> BootstrapResult:
    absolute_expires_at = now + timedelta(seconds=settings.absolute_session_lifetime_seconds)
    session_row = create_anonymous_session(db, now=now, absolute_expires_at=absolute_expires_at)
    raw_token = _generate_token()
    insert_token(
        db,
        anonymous_session_uuid=session_row["anonymous_session_uuid"],
        session_absolute_expires_at=session_row["absolute_expires_at"],
        token_digest=_token_digest(raw_token),
        issued_at=now,
        original_absolute_expires_at=session_row["absolute_expires_at"],
        rotation_reason="issued",
        is_active=True,
        grace_expires_at=None,
    )
    return BootstrapResult(
        session_status="created",
        absolute_expires_at=session_row["absolute_expires_at"],
        cookie_max_age_seconds=settings.cookie_max_age_seconds,
        raw_token=raw_token,
    )


def _validate_locked_record(
    db: Session,
    record: ValidatedSessionRecord | None,
    now: datetime,
) -> ValidatedAnonymousSession | None:
    if record is None:
        return None

    if record.token_original_absolute_expires_at != record.absolute_expires_at:
        revoke_anonymous_session(db, record.anonymous_session_uuid, now, "compromised")
        raise AnonymousSessionHttpError(status.HTTP_401_UNAUTHORIZED, "invalid_session", clear_cookie=True)

    if record.status == "revoked" or record.token_revoked_at is not None or not record.token_is_active:
        raise AnonymousSessionHttpError(status.HTTP_401_UNAUTHORIZED, "revoked_session", clear_cookie=True)

    if record.status == "expired" or record.absolute_expires_at <= now or record.token_original_absolute_expires_at <= now:
        expire_anonymous_session(db, record.anonymous_session_uuid, now)
        raise AnonymousSessionHttpError(status.HTTP_401_UNAUTHORIZED, "expired_session", clear_cookie=True)

    if record.token_grace_expires_at is not None and record.token_grace_expires_at <= now:
        revoke_anonymous_session(db, record.anonymous_session_uuid, now, "expired")
        raise AnonymousSessionHttpError(status.HTTP_401_UNAUTHORIZED, "expired_session", clear_cookie=True)

    touch_anonymous_session(db, record.anonymous_session_uuid, now)
    return ValidatedAnonymousSession(
        anonymous_session_uuid=record.anonymous_session_uuid,
        absolute_expires_at=record.absolute_expires_at,
    )


def bootstrap_anonymous_session(raw_token: str | None) -> BootstrapResult:
    settings = get_anonymous_session_settings()
    now = _utcnow()
    session = _session_factory()()
    try:
        if raw_token:
            record = load_locked_session_for_token(session, _token_digest(raw_token))
            try:
                validated = _validate_locked_record(session, record, now)
            except AnonymousSessionHttpError:
                validated = None
            if validated is not None:
                session.commit()
                return BootstrapResult(
                    session_status="continued",
                    absolute_expires_at=validated.absolute_expires_at,
                    cookie_max_age_seconds=settings.cookie_max_age_seconds,
                )

        result = _create_session_and_token(session, settings, now)
        session.commit()
        return result
    except (DatabaseConfigError, DatabaseNotConfiguredError, SQLAlchemyError) as exc:
        session.rollback()
        LOGGER.warning("anonymous session bootstrap unavailable", extra={"category": _SESSION_COOKIE_ERROR})
        raise AnonymousSessionHttpError(status.HTTP_503_SERVICE_UNAVAILABLE, "service_unavailable") from exc
    finally:
        session.close()


def validate_event_session(raw_token: str | None, *, session: Session | None = None) -> ValidatedAnonymousSession:
    if not raw_token:
        raise AnonymousSessionHttpError(status.HTTP_401_UNAUTHORIZED, "missing_session")

    now = _utcnow()
    owns_session = session is None
    db = session or _session_factory()()
    try:
        record = load_locked_session_for_token(db, _token_digest(raw_token))
        validated = _validate_locked_record(db, record, now)
        if validated is None:
            raise AnonymousSessionHttpError(status.HTTP_401_UNAUTHORIZED, "invalid_session", clear_cookie=True)
        return validated
    except AnonymousSessionHttpError:
        raise
    except (DatabaseConfigError, DatabaseNotConfiguredError, SQLAlchemyError) as exc:
        LOGGER.warning("anonymous session validation unavailable", extra={"category": _SESSION_COOKIE_ERROR})
        raise AnonymousSessionHttpError(status.HTTP_503_SERVICE_UNAVAILABLE, "service_unavailable") from exc
    finally:
        if owns_session:
            db.close()


def rotate_anonymous_session_token(raw_token: str, *, reason: str = "bootstrap_rotation") -> BootstrapResult:
    settings = get_anonymous_session_settings()
    now = _utcnow()
    session = _session_factory()()
    try:
        record = load_locked_session_for_token(session, _token_digest(raw_token))
        validated = _validate_locked_record(session, record, now)
        if validated is None or record is None:
            raise AnonymousSessionHttpError(status.HTTP_401_UNAUTHORIZED, "invalid_session", clear_cookie=True)
        if record.token_grace_expires_at is not None:
            raise AnonymousSessionHttpError(status.HTTP_401_UNAUTHORIZED, "invalid_session", clear_cookie=True)

        load_active_tokens_for_session(session, validated.anonymous_session_uuid)
        revoke_existing_grace_tokens(session, validated.anonymous_session_uuid, now)
        grace_expires_at = min(
            now + timedelta(seconds=settings.token_grace_period_seconds),
            validated.absolute_expires_at,
        )
        convert_primary_token_to_grace(
            session,
            anonymous_session_token_uuid=record.anonymous_session_token_uuid,
            now=now,
            grace_expires_at=grace_expires_at,
        )

        new_raw_token = _generate_token()
        insert_token(
            session,
            anonymous_session_uuid=validated.anonymous_session_uuid,
            session_absolute_expires_at=validated.absolute_expires_at,
            token_digest=_token_digest(new_raw_token),
            issued_at=now,
            original_absolute_expires_at=validated.absolute_expires_at,
            rotation_reason=reason,
            is_active=True,
            grace_expires_at=None,
            predecessor_token_uuid=record.anonymous_session_token_uuid,
        )
        session.commit()
        return BootstrapResult(
            session_status="continued",
            absolute_expires_at=validated.absolute_expires_at,
            cookie_max_age_seconds=settings.cookie_max_age_seconds,
            raw_token=new_raw_token,
        )
    except AnonymousSessionHttpError:
        session.rollback()
        raise
    except (DatabaseConfigError, DatabaseNotConfiguredError, SQLAlchemyError, ValueError) as exc:
        session.rollback()
        LOGGER.warning("anonymous session rotation unavailable", extra={"category": _SESSION_COOKIE_ERROR})
        raise AnonymousSessionHttpError(status.HTTP_503_SERVICE_UNAVAILABLE, "service_unavailable") from exc
    finally:
        session.close()