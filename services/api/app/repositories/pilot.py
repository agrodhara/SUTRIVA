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


def lock_phone_number_for_send(db: Session, *, phone_number: str) -> None:
    """Takes a Postgres transaction-scoped advisory lock keyed on the phone number, auto-released at the
    end of the current transaction (commit or rollback).

    Two different pilot_registrations rows targeting the same phone number take no row lock in common —
    each only locks its own row (see load_pilot_registration_for_update) — so without this, two concurrent
    requests for the same number could both read the per-phone send count before either records its own
    send, and both pass a nearly-exhausted quota. Call this before reading count_recent_otp_sends_for_phone
    and before recording a new send, so a second concurrent request for the same number blocks here until
    the first one has committed (and its send is visible to the count).

    hashtext() is a 32-bit hash, so two different phone numbers can in principle collide onto the same
    lock key; that only ever costs unrelated numbers a moment of unnecessary blocking, it can never let two
    sends to the same real number both slip past the quota check, since same-number collisions are exact
    (the lock key is always the same value for the same number).
    """
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:phone_number))"), {"phone_number": phone_number})


def record_otp_send(
    db: Session,
    *,
    pilot_registration_uuid: str,
    otp_challenge_uuid: str,
    phone_number: str,
    now: datetime,
) -> None:
    """Appends one immutable row recording that this exact phone number was just sent a code, independent
    of what pilot_registrations.phone_number is or later becomes. Called only after the SMS provider has
    actually accepted the send (see send_or_raise) — a rejected or failed send must never appear here."""
    db.execute(
        text(
            """
            INSERT INTO otp_sends (pilot_registration_uuid, otp_challenge_uuid, phone_number, sent_at)
            VALUES (:pilot_registration_uuid, :otp_challenge_uuid, :phone_number, :now)
            """
        ),
        {"pilot_registration_uuid": pilot_registration_uuid, "otp_challenge_uuid": otp_challenge_uuid, "phone_number": phone_number, "now": now},
    )


def count_recent_otp_sends_for_phone(db: Session, *, phone_number: str, since: datetime) -> int:
    """Counts actual sends recorded to this exact phone number (see record_otp_send / otp_sends), not sends
    inferred from a registration's current phone_number.

    The previous version of this query joined otp_challenges to pilot_registrations and filtered on
    pilot_registrations.phone_number — the registration's *current* number. Because "Change number" updates
    that column in place, a registration that sent to +91A and then changed to +91B would have BOTH sends
    attributed to +91B once the join ran, silently erasing +91A's real usage from its own quota. otp_sends
    is an append-only log of each send's actual destination at the time it happened, so this count is
    accurate regardless of any number changes that happen afterward. Callers must hold
    lock_phone_number_for_send's advisory lock for this phone number before trusting this count to decide
    whether another send is allowed.
    """
    total = db.execute(
        text("SELECT count(*) FROM otp_sends WHERE phone_number = :phone_number AND sent_at >= :since"),
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
