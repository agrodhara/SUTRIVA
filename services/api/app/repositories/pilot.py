from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class PilotRegistrationRecord:
    pilot_registration_uuid: str
    journey: str
    status: str
    phone_number: str | None
    phone_verified_at: datetime | None
    anonymous_session_uuid: str | None
    optional_updates_opted_in: bool


@dataclass(frozen=True)
class OtpChallengeRecord:
    otp_challenge_uuid: str
    pilot_registration_uuid: str
    code_hash: bytes
    attempt_count: int
    max_attempts: int
    send_count: int
    expires_at: datetime
    consumed_at: datetime | None
    last_sent_at: datetime


def create_pilot_registration(db: Session, *, journey: str, journey_run_uuid: str | None) -> dict[str, Any]:
    return db.execute(
        text(
            """
            INSERT INTO pilot_registrations (journey, journey_run_uuid, status)
            VALUES (:journey, :journey_run_uuid, 'interest_clicked')
            RETURNING pilot_registration_uuid, status
            """
        ),
        {"journey": journey, "journey_run_uuid": journey_run_uuid},
    ).mappings().one()


def load_pilot_registration_for_update(db: Session, pilot_registration_uuid: str) -> PilotRegistrationRecord | None:
    row = db.execute(
        text(
            """
            SELECT pilot_registration_uuid, journey, status, phone_number, phone_verified_at,
                   anonymous_session_uuid, optional_updates_opted_in
            FROM pilot_registrations
            WHERE pilot_registration_uuid = :pilot_registration_uuid
            FOR UPDATE
            """
        ),
        {"pilot_registration_uuid": pilot_registration_uuid},
    ).mappings().first()
    if row is None:
        return None
    return PilotRegistrationRecord(**row)


def set_pilot_registration_mobile(
    db: Session,
    *,
    pilot_registration_uuid: str,
    phone_number: str,
    optional_updates_opted_in: bool,
    now: datetime,
) -> None:
    db.execute(
        text(
            """
            UPDATE pilot_registrations
            SET phone_number = :phone_number,
                optional_updates_opted_in = :optional_updates_opted_in,
                status = 'mobile_submitted',
                updated_at = :now
            WHERE pilot_registration_uuid = :pilot_registration_uuid
            """
        ),
        {
            "pilot_registration_uuid": pilot_registration_uuid,
            "phone_number": phone_number,
            "optional_updates_opted_in": optional_updates_opted_in,
            "now": now,
        },
    )


def mark_pilot_registration_otp_sent(db: Session, *, pilot_registration_uuid: str, now: datetime) -> None:
    db.execute(
        text("UPDATE pilot_registrations SET status = 'otp_sent', updated_at = :now WHERE pilot_registration_uuid = :pilot_registration_uuid"),
        {"pilot_registration_uuid": pilot_registration_uuid, "now": now},
    )


def mark_pilot_registration_verified(
    db: Session,
    *,
    pilot_registration_uuid: str,
    anonymous_session_uuid: str | None,
    now: datetime,
) -> None:
    """Sets phone_verified_at and links anonymous_session_uuid in the same statement: the two must always
    move together (see ck_pilot_registrations_link_requires_verification)."""
    db.execute(
        text(
            """
            UPDATE pilot_registrations
            SET status = 'verified',
                phone_verified_at = :now,
                anonymous_session_uuid = :anonymous_session_uuid,
                updated_at = :now
            WHERE pilot_registration_uuid = :pilot_registration_uuid
            """
        ),
        {"pilot_registration_uuid": pilot_registration_uuid, "anonymous_session_uuid": anonymous_session_uuid, "now": now},
    )


def create_otp_challenge(
    db: Session,
    *,
    pilot_registration_uuid: str,
    code_hash: bytes,
    expires_at: datetime,
    max_attempts: int,
) -> dict[str, Any]:
    return db.execute(
        text(
            """
            INSERT INTO otp_challenges (pilot_registration_uuid, code_hash, expires_at, max_attempts)
            VALUES (:pilot_registration_uuid, :code_hash, :expires_at, :max_attempts)
            RETURNING otp_challenge_uuid, expires_at
            """
        ),
        {"pilot_registration_uuid": pilot_registration_uuid, "code_hash": code_hash, "expires_at": expires_at, "max_attempts": max_attempts},
    ).mappings().one()


def load_active_otp_challenge_for_update(db: Session, pilot_registration_uuid: str) -> OtpChallengeRecord | None:
    row = db.execute(
        text(
            """
            SELECT otp_challenge_uuid, pilot_registration_uuid, code_hash, attempt_count, max_attempts,
                   send_count, expires_at, consumed_at, last_sent_at
            FROM otp_challenges
            WHERE pilot_registration_uuid = :pilot_registration_uuid AND consumed_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE
            """
        ),
        {"pilot_registration_uuid": pilot_registration_uuid},
    ).mappings().first()
    if row is None:
        return None
    return OtpChallengeRecord(**row)


def replace_otp_challenge_for_resend(
    db: Session,
    *,
    otp_challenge_uuid: str,
    code_hash: bytes,
    expires_at: datetime,
    now: datetime,
) -> None:
    """Reuses the same challenge row — for a resend, a same-number resubmission past cooldown, or a
    "Change number" resubmission — rather than creating a second row, so the one-active-challenge-per-
    registration invariant never needs a race-prone delete-then-insert.

    Deliberately does NOT reset attempt_count: attempts are a lifetime budget for the registration's
    current OTP flow, not a per-code allowance. Resetting it here would let repeated resends manufacture
    unlimited fresh guesses against the max_attempts cap; send_count (and the caller's own per-registration
    and per-phone caps in app/services/pilot.py) is what actually bounds how many codes get sent.
    """
    db.execute(
        text(
            """
            UPDATE otp_challenges
            SET code_hash = :code_hash,
                expires_at = :expires_at,
                send_count = send_count + 1,
                last_sent_at = :now
            WHERE otp_challenge_uuid = :otp_challenge_uuid
            """
        ),
        {"otp_challenge_uuid": otp_challenge_uuid, "code_hash": code_hash, "expires_at": expires_at, "now": now},
    )


def count_recent_otp_sends_for_phone(db: Session, *, phone_number: str, since: datetime) -> int:
    """Sums send_count across every OTP challenge (any registration, any journey) ever tied to this phone
    number, restricted to challenges with recent send activity. Used to cap total sends to one phone number
    across registrations — a per-registration cap alone can be bypassed by starting a fresh registration
    for the same number, since a new registration gets its own, empty send-count budget."""
    total = db.execute(
        text(
            """
            SELECT COALESCE(SUM(oc.send_count), 0)
            FROM otp_challenges oc
            JOIN pilot_registrations pr ON pr.pilot_registration_uuid = oc.pilot_registration_uuid
            WHERE pr.phone_number = :phone_number AND oc.last_sent_at >= :since
            """
        ),
        {"phone_number": phone_number, "since": since},
    ).scalar_one()
    return int(total)


def increment_otp_attempt(db: Session, *, otp_challenge_uuid: str) -> None:
    db.execute(
        text("UPDATE otp_challenges SET attempt_count = attempt_count + 1 WHERE otp_challenge_uuid = :otp_challenge_uuid"),
        {"otp_challenge_uuid": otp_challenge_uuid},
    )


def consume_otp_challenge(db: Session, *, otp_challenge_uuid: str, now: datetime) -> None:
    db.execute(
        text("UPDATE otp_challenges SET consumed_at = :now WHERE otp_challenge_uuid = :otp_challenge_uuid"),
        {"otp_challenge_uuid": otp_challenge_uuid, "now": now},
    )
