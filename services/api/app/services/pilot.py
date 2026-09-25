from __future__ import annotations

import hmac
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
    count_recent_otp_sends_for_phone,
    create_otp_challenge,
    create_pilot_registration,
    increment_otp_attempt,
    load_active_otp_challenge_for_update,
    load_pilot_registration_for_update,
    lock_phone_number_for_send,
    mark_pilot_registration_otp_sent,
    mark_pilot_registration_verified,
    record_otp_send,
    replace_otp_challenge_for_resend,
    set_pilot_registration_mobile,
)
from app.services.sms import SmsProviderNotConfiguredError, SmsSendRejectedError, get_sms_sender, send_or_raise

LOGGER = logging.getLogger(__name__)


class PilotServiceError(Exception):
    def __init__(self, status_code: int, code: str) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code


class PilotOtpKeyNotConfiguredError(RuntimeError):
    """Raised when PILOT_OTP_HMAC_KEYS is unset. Like SmsProviderNotConfiguredError, this must never be
    caught and papered over: a code cannot be safely hashed or verified without a keyed secret held
    outside the database (a bare hash of a 6-digit code is trivially reversible offline from a stolen
    database row), so a deployment missing this must fail loudly rather than fall back to something
    unkeyed."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _session_factory():
    settings = get_database_settings()
    return get_session_factory(settings)


def _generate_code(length: int) -> str:
    # A random digit string, not a random int converted to string: this keeps leading zeros and a fixed
    # length (e.g. "004821"), which int-then-zfill approaches get subtly wrong under some edge cases.
    return "".join(str(secrets.randbelow(10)) for _ in range(length))


def _keyed_hash(code: str, key: str) -> bytes:
    # HMAC-SHA256, not a bare hash: a 6-digit code is a tiny (10^length) search space, so a bare SHA-256 of
    # it can be brute-forced offline in a fraction of a second from a stolen database row alone, with no
    # need for the secret this HMAC key adds. The key is read only from configuration (never stored in the
    # database next to the hash it protects), so a stolen database row is not enough on its own to recover
    # or forge a code — see PilotOtpSettings.hmac_keys for the rotation path.
    return hmac.new(key.encode("utf-8"), code.encode("utf-8"), "sha256").digest()


def _sign_new_code(code: str, hmac_keys: tuple[str, ...]) -> bytes:
    if not hmac_keys:
        raise PilotOtpKeyNotConfiguredError("PILOT_OTP_HMAC_KEYS is not configured")
    return _keyed_hash(code, hmac_keys[0])  # the current (newest) key signs every new code


def _code_matches(code: str, stored_hash: bytes, hmac_keys: tuple[str, ...]) -> bool:
    if not hmac_keys:
        raise PilotOtpKeyNotConfiguredError("PILOT_OTP_HMAC_KEYS is not configured")
    # Tried against every configured key, not just the current one, so a key rotation (prepending a new
    # key) never invalidates a code that was already sent under the previous key.
    return any(secrets.compare_digest(_keyed_hash(code, key), stored_hash) for key in hmac_keys)


@dataclass(frozen=True)
class MobileSubmitResult:
    expires_at: datetime
    resend_after_seconds: int


def _wrap_db_errors(exc: Exception) -> PilotServiceError:
    LOGGER.warning("pilot service database error", exc_info=exc)
    return PilotServiceError(status.HTTP_503_SERVICE_UNAVAILABLE, "service_unavailable")


def _map_send_errors(exc: Exception) -> PilotServiceError | None:
    """Shared error mapping for the two operations that actually place an SMS send: submit and resend."""
    if isinstance(exc, SmsProviderNotConfiguredError):
        return PilotServiceError(status.HTTP_503_SERVICE_UNAVAILABLE, "sms_provider_not_configured")
    if isinstance(exc, SmsSendRejectedError):
        return PilotServiceError(status.HTTP_503_SERVICE_UNAVAILABLE, "sms_send_failed")
    if isinstance(exc, PilotOtpKeyNotConfiguredError):
        return PilotServiceError(status.HTTP_503_SERVICE_UNAVAILABLE, "otp_signing_key_not_configured")
    return None


def register_interest(*, journey: str, journey_run_id: str | None) -> str:
    """Step 6A: anonymous interest click only. Records nothing beyond the journey — no phone, OTP,
    identity or permission field exists to record here.

    journey_run_id is accepted from the client (so the request shape matches other trackEvent-adjacent
    calls) but is intentionally NOT resolved to a journey_runs row in Phase 1.1B: unlike the product_events
    pipeline (see app/repositories/anonymous_continuity.py's upsert_journey_run, which needs an anonymous
    session to resolve a client-supplied id into a real journey_runs.journey_run_uuid), Step 6A performs no
    such resolution. pilot_registrations.journey_run_uuid is therefore always NULL — this is a deliberate,
    documented gap, not an oversight, and not a claim that a pilot registration is linked to a specific
    journey run's events. See test_journey_run_id_is_accepted_but_never_linked_in_phase_1_1b.
    """
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


def _enforce_send_quota(
    db: Session,
    *,
    phone_number: str,
    current_send_count: int,
    otp_settings: PilotOtpSettings,
    now: datetime,
) -> None:
    """Bounds total sends two independent ways, neither of which a resend or a fresh registration can
    route around:

    - Per-registration: current_send_count already reflects every send (initial + every resend/change-
      number) this registration has ever made, since replace_otp_challenge_for_resend increments it on the
      same row rather than starting a new one.
    - Per-phone, across every registration: a new registration starts its own send_count at zero, so the
      per-registration cap alone could be bypassed by re-registering with the same phone number. This
      counts actual recorded sends to the phone number itself (see otp_sends / count_recent_otp_sends_for_phone),
      independent of which registration sent them or what any registration's phone_number is now.

    Acquires lock_phone_number_for_send's advisory lock first: without it, two concurrent requests for the
    same phone number (necessarily different registrations, since a single registration's row lock already
    serializes requests against itself) could both read a nearly-exhausted count before either records its
    own send, and both pass. The lock is released automatically when the caller's transaction ends, so
    holding it here does not require any extra cleanup from the caller.
    """
    if current_send_count + 1 > otp_settings.max_sends_per_registration:
        raise PilotServiceError(status.HTTP_429_TOO_MANY_REQUESTS, "resend_limit_reached")

    lock_phone_number_for_send(db, phone_number=phone_number)
    since = now - timedelta(hours=otp_settings.phone_send_window_hours)
    recent_for_phone = count_recent_otp_sends_for_phone(db, phone_number=phone_number, since=since)
    if recent_for_phone + 1 > otp_settings.max_sends_per_phone:
        raise PilotServiceError(status.HTTP_429_TOO_MANY_REQUESTS, "phone_send_limit_reached")


def submit_mobile_and_send_otp(
    *,
    pilot_registration_id: str,
    phone_number: str,
    optional_updates_opted_in: bool,
    settings: PilotOtpSettings | None = None,
) -> MobileSubmitResult:
    """Step 6B start: records the phone number and the separate, unchecked-by-default optional-updates
    choice, then generates and sends a fresh OTP. Never links the anonymous session here — that only
    happens on successful verification.

    Handles re-entry (the frontend's "Back" then resubmit, or "Change number") against an active,
    unconsumed challenge: the database allows only one such row per registration
    (uq_otp_challenges_one_active_per_registration), so a second plain INSERT here would raise an
    IntegrityError. Resubmitting the *same* number is treated exactly like a resend (the cooldown applies,
    so this can't be used to sidestep it); a genuinely *different* number ("Change number" correcting a
    mistake) is not time-limited, but still counts against the send caps below like any other send.
    """
    otp_settings = settings or get_pilot_otp_settings()
    session = _session_factory()()
    try:
        record = _require_registration(session, pilot_registration_id)
        if record.status == "verified":
            raise PilotServiceError(status.HTTP_409_CONFLICT, "already_verified")

        now = _utcnow()
        existing_challenge = load_active_otp_challenge_for_update(session, pilot_registration_id)

        if existing_challenge is not None and record.phone_number == phone_number:
            cooldown_elapsed = (now - existing_challenge.last_sent_at).total_seconds()
            if cooldown_elapsed < otp_settings.resend_cooldown_seconds:
                raise PilotServiceError(status.HTTP_429_TOO_MANY_REQUESTS, "resend_too_soon")

        _enforce_send_quota(
            session,
            phone_number=phone_number,
            current_send_count=existing_challenge.send_count if existing_challenge else 0,
            otp_settings=otp_settings,
            now=now,
        )

        set_pilot_registration_mobile(
            session,
            pilot_registration_uuid=pilot_registration_id,
            phone_number=phone_number,
            optional_updates_opted_in=optional_updates_opted_in,
            now=now,
        )

        code = _generate_code(otp_settings.code_length)
        expires_at = now + timedelta(seconds=otp_settings.code_ttl_seconds)
        code_hash = _sign_new_code(code, otp_settings.hmac_keys)

        if existing_challenge is not None:
            replace_otp_challenge_for_resend(
                session, otp_challenge_uuid=existing_challenge.otp_challenge_uuid, code_hash=code_hash, expires_at=expires_at, now=now
            )
            result_expires_at = expires_at
            otp_challenge_uuid = existing_challenge.otp_challenge_uuid
        else:
            challenge = create_otp_challenge(
                session,
                pilot_registration_uuid=pilot_registration_id,
                code_hash=code_hash,
                expires_at=expires_at,
                max_attempts=otp_settings.max_attempts,
            )
            result_expires_at = challenge["expires_at"]
            otp_challenge_uuid = str(challenge["otp_challenge_uuid"])

        # Sent only after the DB rows exist, but before commit: if the provider raises or rejects the send,
        # the whole transaction rolls back rather than leaving a "sent" row for a message that never went
        # out — see send_or_raise, which checks the provider's own accepted result.
        send_or_raise(get_sms_sender(otp_settings), phone_number=phone_number, code=code)

        # Recorded with the exact number just sent to, not read back from pilot_registrations later — see
        # count_recent_otp_sends_for_phone's docstring for why that distinction is the whole point.
        record_otp_send(session, pilot_registration_uuid=pilot_registration_id, otp_challenge_uuid=otp_challenge_uuid, phone_number=phone_number, now=now)

        mark_pilot_registration_otp_sent(session, pilot_registration_uuid=pilot_registration_id, now=now)
        session.commit()
        return MobileSubmitResult(expires_at=result_expires_at, resend_after_seconds=otp_settings.resend_cooldown_seconds)
    except (SmsProviderNotConfiguredError, SmsSendRejectedError, PilotOtpKeyNotConfiguredError) as exc:
        session.rollback()
        raise _map_send_errors(exc) from exc
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

        _enforce_send_quota(
            session, phone_number=record.phone_number, current_send_count=challenge.send_count, otp_settings=otp_settings, now=now
        )

        code = _generate_code(otp_settings.code_length)
        expires_at = now + timedelta(seconds=otp_settings.code_ttl_seconds)
        code_hash = _sign_new_code(code, otp_settings.hmac_keys)

        send_or_raise(get_sms_sender(otp_settings), phone_number=record.phone_number, code=code)

        record_otp_send(
            session, pilot_registration_uuid=pilot_registration_id, otp_challenge_uuid=challenge.otp_challenge_uuid, phone_number=record.phone_number, now=now
        )
        replace_otp_challenge_for_resend(session, otp_challenge_uuid=challenge.otp_challenge_uuid, code_hash=code_hash, expires_at=expires_at, now=now)
        session.commit()
        return MobileSubmitResult(expires_at=expires_at, resend_after_seconds=otp_settings.resend_cooldown_seconds)
    except (SmsProviderNotConfiguredError, SmsSendRejectedError, PilotOtpKeyNotConfiguredError) as exc:
        session.rollback()
        raise _map_send_errors(exc) from exc
    except (DatabaseConfigError, DatabaseNotConfiguredError) as exc:
        session.rollback()
        raise _wrap_db_errors(exc) from exc
    finally:
        session.close()


def verify_otp(
    *,
    pilot_registration_id: str,
    code: str,
    anonymous_session_uuid: str | None,
    settings: PilotOtpSettings | None = None,
) -> None:
    """Step 6B finish. Anonymous-history linking happens only inside this function, only on success, and
    only using the session already validated by the caller — verify_otp never accepts a session id that
    hasn't already been through the normal anonymous-session cookie validation."""
    otp_settings = settings or get_pilot_otp_settings()
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

        if not _code_matches(code, challenge.code_hash, otp_settings.hmac_keys):
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
    except PilotOtpKeyNotConfiguredError as exc:
        session.rollback()
        raise PilotServiceError(status.HTTP_503_SERVICE_UNAVAILABLE, "otp_signing_key_not_configured") from exc
    except (DatabaseConfigError, DatabaseNotConfiguredError) as exc:
        session.rollback()
        raise _wrap_db_errors(exc) from exc
    finally:
        session.close()


def pilot_service_error_to_http(exc: PilotServiceError) -> HTTPException:
    return HTTPException(status_code=exc.status_code, detail=exc.code)
