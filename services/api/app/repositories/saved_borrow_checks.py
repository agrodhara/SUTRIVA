from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class SavedBorrowCheckRecord:
    saved_borrow_check_uuid: str
    situation_key: str
    input_values: dict
    provenance: str
    result_title: str
    result_headline: str
    result_detail: str
    result_insight: str
    result_scenario: str
    result_note: str
    result_bars: list
    notice_version: str
    created_at: datetime
    expires_at: datetime
    deleted_at: datetime | None


def insert_saved_borrow_check(
    db: Session,
    *,
    situation_key: str,
    anonymous_session_uuid: str | None,
    access_email: str,
    input_values: dict,
    provenance: str,
    result_title: str,
    result_headline: str,
    result_detail: str,
    result_insight: str,
    result_scenario: str,
    result_note: str,
    result_bars: list,
    notice_version: str,
    retrieval_token_hash: str,
    expires_at: datetime,
) -> str:
    """Always a fresh row — a save is a point-in-time snapshot, never an update to a prior one (see
    B1_SAVED_CHECK_SPEC.md's Versioning section). Returns the new row's uuid, as a string.
    """
    row = db.execute(
        text(
            """
            INSERT INTO saved_borrow_checks (
                situation_key, anonymous_session_uuid, access_email, input_values, provenance,
                result_title, result_headline, result_detail, result_insight, result_scenario, result_note,
                result_bars, notice_version, retrieval_token_hash, expires_at
            ) VALUES (
                :situation_key, :anonymous_session_uuid, :access_email, CAST(:input_values AS json), :provenance,
                :result_title, :result_headline, :result_detail, :result_insight, :result_scenario, :result_note,
                CAST(:result_bars AS json), :notice_version, :retrieval_token_hash, :expires_at
            )
            RETURNING saved_borrow_check_uuid
            """
        ),
        {
            "situation_key": situation_key,
            "anonymous_session_uuid": anonymous_session_uuid,
            "access_email": access_email,
            "input_values": json.dumps(input_values),
            "provenance": provenance,
            "result_title": result_title,
            "result_headline": result_headline,
            "result_detail": result_detail,
            "result_insight": result_insight,
            "result_scenario": result_scenario,
            "result_note": result_note,
            "result_bars": json.dumps(result_bars),
            "notice_version": notice_version,
            "retrieval_token_hash": retrieval_token_hash,
            "expires_at": expires_at,
        },
    ).first()
    return str(row[0])


def _to_record(row) -> SavedBorrowCheckRecord:
    return SavedBorrowCheckRecord(
        saved_borrow_check_uuid=str(row["saved_borrow_check_uuid"]),
        situation_key=row["situation_key"],
        input_values=row["input_values"],
        provenance=row["provenance"],
        result_title=row["result_title"],
        result_headline=row["result_headline"],
        result_detail=row["result_detail"],
        result_insight=row["result_insight"],
        result_scenario=row["result_scenario"],
        result_note=row["result_note"],
        result_bars=row["result_bars"],
        notice_version=row["notice_version"],
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        deleted_at=row["deleted_at"],
    )


def get_saved_borrow_check_by_token_hash(db: Session, *, retrieval_token_hash: str) -> SavedBorrowCheckRecord | None:
    """Looked up by hash only — the raw token is never stored, so this is the only lookup path that can
    ever exist. Returns a row regardless of expiry/deletion state; the caller (see
    app/services/saved_borrow_checks.py) decides what "no longer valid" means from expires_at/deleted_at,
    so every rejection reason gets the identical caller-visible outcome rather than leaking which one it
    was — the same discipline already applied to OTP verification's generic failure responses.
    """
    row = db.execute(
        text(
            """
            SELECT saved_borrow_check_uuid, situation_key, input_values, provenance, result_title,
                   result_headline, result_detail, result_insight, result_scenario, result_note,
                   result_bars, notice_version, created_at, expires_at, deleted_at
            FROM saved_borrow_checks
            WHERE retrieval_token_hash = :retrieval_token_hash
            """
        ),
        {"retrieval_token_hash": retrieval_token_hash},
    ).mappings().first()
    return _to_record(row) if row is not None else None


def soft_delete_saved_borrow_check(db: Session, *, retrieval_token_hash: str) -> bool:
    """Sets deleted_at now() if not already set. Returns True if this call is what deleted it, False if it
    was already deleted (idempotent) or the token doesn't match any row. Never a hard DELETE here — the
    purge job (purge_expired_and_deleted_saved_borrow_checks) is the only hard-delete path, so there is one
    consistent sweep instead of two delete code paths (see B1_SAVED_CHECK_SPEC.md's Retention section).
    """
    row = db.execute(
        text(
            """
            UPDATE saved_borrow_checks
            SET deleted_at = now()
            WHERE retrieval_token_hash = :retrieval_token_hash AND deleted_at IS NULL
            RETURNING saved_borrow_check_uuid
            """
        ),
        {"retrieval_token_hash": retrieval_token_hash},
    ).first()
    return row is not None


def purge_expired_and_deleted_saved_borrow_checks(db: Session, *, grace_hours: int, batch_size: int) -> int:
    """Hard-deletes rows past expires_at, or soft-deleted more than grace_hours ago. Bounded by
    batch_size per call — same pattern as the existing anonymous-session/event purge job, run repeatedly
    by a scheduler until it reports 0 removed, rather than one unbounded sweep. Returns the number of rows
    actually removed this call.
    """
    result = db.execute(
        text(
            """
            DELETE FROM saved_borrow_checks
            WHERE saved_borrow_check_uuid IN (
                SELECT saved_borrow_check_uuid FROM saved_borrow_checks
                WHERE expires_at <= now() OR (deleted_at IS NOT NULL AND deleted_at <= now() - make_interval(hours => :grace_hours))
                LIMIT :batch_size
            )
            """
        ),
        {"grace_hours": grace_hours, "batch_size": batch_size},
    )
    return result.rowcount
