from __future__ import annotations

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.db.config import DatabaseConfigError, DatabaseNotConfiguredError, get_database_settings
from app.db.session import get_session_factory
from app.pilot_config import PilotOtpSettings, get_pilot_otp_settings
from app.repositories.pilot import (
    OtpChallengeRecord,
    PilotRegistrationRecord,
    consume_otp_challenge,
    create_otp_challenge,
    create_pilot_registration,
    increment_otp_attempt,
    load_active_otp_challenge_for_update,
    load_pilot_registration_for_update,
    mark_pilot_registration_otp_sent,
    mark_pilot_registration_verified,
    replace_otp_challenge_for_resend,
    set_pilot_registration_mobile,
)
from app.services.sms import SmsProviderNotConfiguredError, get_sms_sender

LOGGER = logging.getLogger(__name__)


class PilotServiceError(Exception):
    def __init__(self, status_code: int, code: str) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _session_factory():
    settings = get_database_settings()
    return get_session_factory(settings)


def _generate_code(length: int) -> str:
    # A random digit string, not a random int converted to string: this keeps leading zeros and a fixed
    # length (e.g. "004821"), which int-then-zfill approaches get subtly wrong under some edge cases.
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def _hash_code(code: str) -> bytes:
    # A 6-digit code's real protection is the attempt limit and short expiry enforced below, not the hash's
    # cryptographic strength (a stolen hash of a 6-digit space is trivially brute-forced offline regardless
    # of algorithm). SHA-256 here exists so the code is never stored in a form readable directly from the
    # database, not as the primary security boundary.
    return hashlib.sha256(code.encode("utf-8")).digest()


@dataclass(frozen=True)
class MobileSubmitResult:
    expires_at: datetime
    resend_after_seconds: int


def _wrap_db_errors(exc: Exception) -> PilotServiceError:
    LOGGER.warning("pilot service database error", exc_info=exc)
    return PilotServiceError(status.HTTP_503_SERVICE_UNAVAILABLE, "service_unavailable")


def register_interest(*, journey: str, journey_run_id: str | None) -> str:
    """Step 6A: anonymous interest click only. Records nothing beyond the journey — no phone, OTP,
    identity or permission field exists to record here."""
    session = _session_factory()()
    try:
        row = create_pilot_registration(session, journey=journey, journey_run_uuid=None)
        session.commit()
        return str(row["pilot_registration_uuid"])
    except (DatabaseConfigError, DatabaseNotConfiguredError) as exc:
        session.rollback()
        raise _wrap_db_errors(exc) from exc
    finally:
        session.close()


def _require_registration(db: Session, pilot_registration_uuid: str) -> PilotRegistrationRecord:
    record = load_pilot_registration_for_update(db, pilot_registration_uuid)
    if record is None:
        raise PilotServiceError(status.HTTP_404_NOT_FOUND, "pilot_registration_not_found")
    return record


def submit_mobile_and_send_otp(
    *,
    pilot_registration_id: str,
    phone_number: str,
    optional_updates_opted_in: bool,
    settings: PilotOtpSettings | None = None,
) -> MobileSubmitResult:
    """Step 6B start: records the phone number and the separate, unchecked-by-default optional-updates
    choice, then generates and sends a fresh OTP. Never links the anonymous session here — that only
    happens on successful verification."""
    otp_settings = settings or get_pilot_otp_settings()
    session = _session_factory()()
    try:
        record = _require_registration(session, pilot_registration_id)
        if record.status == "verified":
            raise PilotServiceError(status.HTTP_409_CONFLICT, "already_verified")

        now = _utcnow()
        set_pilot_registration_mobile(
            session,
            pilot_registration_uuid=pilot_registration_id,
            phone_number=phone_number,
            optional_updates_opted_in=optional_updates_opted_in,
            now=now,
        )

        code = _generate_code(otp_settings.code_length)
        expires_at = now + timedelta(seconds=otp_settings.code_ttl_seconds)
        challenge = create_otp_challenge(
            session,
            pilot_registration_uuid=pilot_registration_id,
            code_hash=_hash_code(code),
            expires_at=expires_at,
            max_attempts=otp_settings.max_attempts,
        )

        # Sent only after the DB rows exist, but before commit: if the provider raises, the whole
        # transaction rolls back rather than leaving a "sent" row for a message that was never accepted.
        sender = get_sms_sender(otp_settings)
        sender.send(phone_number=phone_number, code=code)

        mark_pilot_registration_otp_sent(session, pilot_registration_uuid=pilot_registration_id, now=now)
        session.commit()
        return MobileSubmitResult(expires_at=challenge["expires_at"], resend_after_seconds=otp_settings.resend_cooldown_seconds)
    except SmsProviderNotConfiguredError as exc:
        session.rollback()
        raise PilotServiceError(status.HTTP_503_SERVICE_UNAVAILABLE, "sms_provider_not_configured") from exc
    except (DatabaseConfigError, DatabaseNotConfiguredError) as exc:
        session.rollback()
        raise _wrap_db_errors(exc) from exc
    finally:
        session.close()


def resend_otp(*, pilot_registration_id: str, settings: PilotOtpSettings | None = None) -> MobileSubmitResult:
    otp_settings = settings or get_pilot_otp_settings()
    session = _session_factory()()
    try:
        record = _require_registration(session, pilot_registration_id)
        if record.status == "verified":
            raise PilotServiceError(status.HTTP_409_CONFLICT, "already_verified")
        if record.phone_number is None:
            raise PilotServiceError(status.HTTP_409_CONFLICT, "pilot_registration_not_found")

        challenge = load_active_otp_challenge_for_update(session, pilot_registration_id)
        if challenge is None:
            raise PilotServiceError(status.HTTP_409_CONFLICT, "pilot_registration_not_found")

        now = _utcnow()
        cooldown_elapsed = (now - challenge.last_sent_at).total_seconds()
        if cooldown_elapsed < otp_settings.resend_cooldown_seconds:
            raise PilotServiceError(status.HTTP_429_TOO_MANY_REQUESTS, "resend_too_soon")

        code = _generate_code(otp_settings.code_length)
        expires_at = now + timedelta(seconds=otp_settings.code_ttl_seconds)

        sender = get_sms_sender(otp_settings)
        sender.send(phone_number=record.phone_number, code=code)

        replace_otp_challenge_for_resend(session, otp_challenge_uuid=challenge.otp_challenge_uuid, code_hash=_hash_code(code), expires_at=expires_at, now=now)
        session.commit()
        return MobileSubmitResult(expires_at=expires_at, resend_after_seconds=otp_settings.resend_cooldown_seconds)
    except SmsProviderNotConfiguredError as exc:
        session.rollback()
        raise PilotServiceError(status.HTTP_503_SERVICE_UNAVAILABLE, "sms_provider_not_configured") from exc
    except (DatabaseConfigError, DatabaseNotConfiguredError) as exc:
        session.rollback()
        raise _wrap_db_errors(exc) from exc
    finally:
        session.close()


def verify_otp(*, pilot_registration_id: str, code: str, anonymous_session_uuid: str | None) -> None:
    """Step 6B finish. Anonymous-history linking happens only inside this function, only on success, and
    only using the session already validated by the caller — verify_otp never accepts a session id that
    hasn't already been through the normal anonymous-session cookie validation."""
    session = _session_factory()()
    try:
        record = _require_registration(session, pilot_registration_id)
        if record.status == "verified":
            raise PilotServiceError(status.HTTP_409_CONFLICT, "already_verified")

        challenge = load_active_otp_challenge_for_update(session, pilot_registration_id)
        if challenge is None:
            raise PilotServiceError(status.HTTP_404_NOT_FOUND, "pilot_registration_not_found")

        now = _utcnow()
        if challenge.expires_at <= now:
            raise PilotServiceError(status.HTTP_410_GONE, "code_expired")
        if challenge.attempt_count >= challenge.max_attempts:
            raise PilotServiceError(status.HTTP_429_TOO_MANY_REQUESTS, "too_many_attempts")

        if not secrets.compare_digest(_hash_code(code), challenge.code_hash):
            increment_otp_attempt(session, otp_challenge_uuid=challenge.otp_challenge_uuid)
            session.commit()
            raise PilotServiceError(status.HTTP_401_UNAUTHORIZED, "invalid_code")

        consume_otp_challenge(session, otp_challenge_uuid=challenge.otp_challenge_uuid, now=now)
        mark_pilot_registration_verified(
            session,
            pilot_registration_uuid=pilot_registration_id,
            anonymous_session_uuid=anonymous_session_uuid,
            now=now,
        )
        session.commit()
    except (DatabaseConfigError, DatabaseNotConfiguredError) as exc:
        session.rollback()
        raise _wrap_db_errors(exc) from exc
    finally:
        session.close()


def pilot_service_error_to_http(exc: PilotServiceError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.code)
