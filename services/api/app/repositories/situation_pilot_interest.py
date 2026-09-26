from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class PilotInterestAdminRecord:
    situation_pilot_interest_uuid: str
    journey: str
    situation_key: str
    email: str
    created_at: datetime


def insert_situation_pilot_interest(
    db: Session,
    *,
    journey: str,
    situation_key: str,
    email: str,
    anonymous_session_uuid: str | None,
) -> bool:
    """Inserts one row, or does nothing if (email, situation_key) already exists (see
    uq_situation_pilot_interest_email_situation). Returns True for a fresh insert, False when the pair was
    already registered — both are a success from the caller's point of view (see
    app/services/situation_pilot_interest.py.register_pilot_interest), this only distinguishes them for
    the response's `status` field and for tests."""
    row = db.execute(
        text(
            """
            INSERT INTO situation_pilot_interest (journey, situation_key, email, anonymous_session_uuid)
            VALUES (:journey, :situation_key, :email, :anonymous_session_uuid)
            ON CONFLICT (email, situation_key) DO NOTHING
            RETURNING situation_pilot_interest_uuid
            """
        ),
        {"journey": journey, "situation_key": situation_key, "email": email, "anonymous_session_uuid": anonymous_session_uuid},
    ).first()
    return row is not None


def list_situation_pilot_interest(db: Session, *, limit: int, before: datetime | None) -> list[PilotInterestAdminRecord]:
    rows = db.execute(
        text(
            """
            SELECT situation_pilot_interest_uuid, journey, situation_key, email, created_at
            FROM situation_pilot_interest
            -- Explicit CAST (not the "::" shorthand — SQLAlchemy's text() bind-parameter parser does not
            -- reliably split ":before::timestamptz" back into the ":before" param plus a cast): psycopg3's
            -- server-side parameter binding cannot infer a type for :before when it is NULL and compared
            -- both with IS NULL and "<" in the same statement, and raises AmbiguousParameter without one.
            WHERE CAST(:before AS timestamptz) IS NULL OR created_at < CAST(:before AS timestamptz)
            ORDER BY created_at DESC
            LIMIT :limit
            """
        ),
        {"limit": limit, "before": before},
    ).mappings().all()
    return [
        PilotInterestAdminRecord(
            situation_pilot_interest_uuid=str(row["situation_pilot_interest_uuid"]),
            journey=row["journey"],
            situation_key=row["situation_key"],
            email=row["email"],
            created_at=row["created_at"],
        )
        for row in rows
    ]
