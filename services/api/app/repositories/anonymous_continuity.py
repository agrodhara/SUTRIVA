from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session


@dataclass(frozen=True)
class ValidatedSessionRecord:
    anonymous_session_uuid: str
    anonymous_session_token_uuid: str
    absolute_expires_at: datetime
    status: str
    token_is_active: bool
    token_grace_expires_at: datetime | None
    token_revoked_at: datetime | None
    token_original_absolute_expires_at: datetime


def create_anonymous_session(
    db: Session,
    *,
    now: datetime,
    absolute_expires_at: datetime,
) -> dict[str, Any]:
    return db.execute(
        text(
            """
            INSERT INTO anonymous_sessions (
                first_seen_at,
                last_seen_at,
                absolute_expires_at,
                status
            )
            VALUES (
                :now,
                :now,
                :absolute_expires_at,
                'active'
            )
            RETURNING anonymous_session_uuid, absolute_expires_at, status, created_at
            """
        ),
        {"now": now, "absolute_expires_at": absolute_expires_at},
    ).mappings().one()


def insert_token(
    db: Session,
    *,
    anonymous_session_uuid: str,
    session_absolute_expires_at: datetime,
    token_digest: bytes,
    issued_at: datetime,
    original_absolute_expires_at: datetime,
    rotation_reason: str,
    is_active: bool,
    grace_expires_at: datetime | None,
    predecessor_token_uuid: str | None = None,
) -> dict[str, Any]:
    if original_absolute_expires_at != session_absolute_expires_at:
        raise ValueError("Token absolute expiry must equal the parent session absolute expiry")

    return db.execute(
        text(
            """
            INSERT INTO anonymous_session_tokens (
                anonymous_session_uuid,
                token_digest,
                issued_at,
                original_absolute_expires_at,
                rotation_reason,
                is_active,
                grace_expires_at,
                predecessor_token_uuid
            )
            VALUES (
                :anonymous_session_uuid,
                :token_digest,
                :issued_at,
                :original_absolute_expires_at,
                :rotation_reason,
                :is_active,
                :grace_expires_at,
                :predecessor_token_uuid
            )
            RETURNING anonymous_session_token_uuid, original_absolute_expires_at, issued_at
            """
        ),
        {
            "anonymous_session_uuid": anonymous_session_uuid,
            "token_digest": token_digest,
            "issued_at": issued_at,
            "original_absolute_expires_at": original_absolute_expires_at,
            "rotation_reason": rotation_reason,
            "is_active": is_active,
            "grace_expires_at": grace_expires_at,
            "predecessor_token_uuid": predecessor_token_uuid,
        },
    ).mappings().one()


def load_locked_session_for_token(db: Session, token_digest: bytes) -> ValidatedSessionRecord | None:
    row = db.execute(
        text(
            """
            SELECT
                s.anonymous_session_uuid,
                s.absolute_expires_at,
                s.status,
                t.anonymous_session_token_uuid,
                t.is_active AS token_is_active,
                t.grace_expires_at AS token_grace_expires_at,
                t.revoked_at AS token_revoked_at,
                t.original_absolute_expires_at AS token_original_absolute_expires_at
            FROM anonymous_session_tokens t
            JOIN anonymous_sessions s ON s.anonymous_session_uuid = t.anonymous_session_uuid
            WHERE t.token_digest = :token_digest
            ORDER BY t.issued_at DESC
            LIMIT 1
            FOR UPDATE OF s, t
            """
        ),
        {"token_digest": token_digest},
    ).mappings().first()
    if row is None:
        return None
    return ValidatedSessionRecord(**row)


def touch_anonymous_session(db: Session, anonymous_session_uuid: str, now: datetime) -> None:
    db.execute(
        text(
            """
            UPDATE anonymous_sessions
            SET last_seen_at = :now,
                updated_at = :now
            WHERE anonymous_session_uuid = :anonymous_session_uuid
            """
        ),
        {"anonymous_session_uuid": anonymous_session_uuid, "now": now},
    )


def expire_anonymous_session(db: Session, anonymous_session_uuid: str, now: datetime) -> None:
    db.execute(
        text(
            """
            UPDATE anonymous_sessions
            SET status = 'expired',
                expired_at = COALESCE(expired_at, :now),
                updated_at = :now
            WHERE anonymous_session_uuid = :anonymous_session_uuid
              AND revoked_at IS NULL
            """
        ),
        {"anonymous_session_uuid": anonymous_session_uuid, "now": now},
    )
    db.execute(
        text(
            """
            UPDATE anonymous_session_tokens
            SET is_active = false,
                revoked_at = COALESCE(revoked_at, :now),
                rotation_reason = CASE WHEN rotation_reason IN ('logout', 'compromised') THEN rotation_reason ELSE 'expired' END,
                grace_expires_at = NULL
            WHERE anonymous_session_uuid = :anonymous_session_uuid
              AND is_active = true
            """
        ),
        {"anonymous_session_uuid": anonymous_session_uuid, "now": now},
    )


def revoke_anonymous_session(db: Session, anonymous_session_uuid: str, now: datetime, reason: str) -> None:
    db.execute(
        text(
            """
            UPDATE anonymous_sessions
            SET status = 'revoked',
                revoked_at = COALESCE(revoked_at, :now),
                revocation_reason = :reason,
                updated_at = :now
            WHERE anonymous_session_uuid = :anonymous_session_uuid
            """
        ),
        {"anonymous_session_uuid": anonymous_session_uuid, "now": now, "reason": reason},
    )
    db.execute(
        text(
            """
            UPDATE anonymous_session_tokens
            SET is_active = false,
                revoked_at = COALESCE(revoked_at, :now),
                rotation_reason = :reason,
                grace_expires_at = NULL
            WHERE anonymous_session_uuid = :anonymous_session_uuid
              AND is_active = true
            """
        ),
        {"anonymous_session_uuid": anonymous_session_uuid, "now": now, "reason": reason},
    )


def load_active_tokens_for_session(db: Session, anonymous_session_uuid: str) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT anonymous_session_token_uuid, grace_expires_at, original_absolute_expires_at, is_active
            FROM anonymous_session_tokens
            WHERE anonymous_session_uuid = :anonymous_session_uuid
              AND is_active = true
            ORDER BY issued_at DESC
            FOR UPDATE
            """
        ),
        {"anonymous_session_uuid": anonymous_session_uuid},
    ).mappings().all()
    return [dict(row) for row in rows]


def revoke_existing_grace_tokens(db: Session, anonymous_session_uuid: str, now: datetime) -> None:
    db.execute(
        text(
            """
            UPDATE anonymous_session_tokens
            SET is_active = false,
                revoked_at = COALESCE(revoked_at, :now),
                rotation_reason = 'superseded',
                grace_expires_at = NULL
            WHERE anonymous_session_uuid = :anonymous_session_uuid
              AND is_active = true
              AND grace_expires_at IS NOT NULL
            """
        ),
        {"anonymous_session_uuid": anonymous_session_uuid, "now": now},
    )


def convert_primary_token_to_grace(
    db: Session,
    *,
    anonymous_session_token_uuid: str,
    now: datetime,
    grace_expires_at: datetime,
) -> None:
    db.execute(
        text(
            """
            UPDATE anonymous_session_tokens
            SET grace_expires_at = :grace_expires_at,
                rotation_reason = 'grace_rotation'
            WHERE anonymous_session_token_uuid = :anonymous_session_token_uuid
            """
        ),
        {
            "anonymous_session_token_uuid": anonymous_session_token_uuid,
            "grace_expires_at": grace_expires_at,
            "now": now,
        },
    )


def upsert_journey_run(
    db: Session,
    *,
    anonymous_session_uuid: str,
    client_journey_run_id: str,
    journey: str,
    version: str,
    decision_context: str,
    received_at: datetime,
) -> dict[str, Any]:
    return db.execute(
        text(
            """
            INSERT INTO journey_runs (
                anonymous_session_uuid,
                client_journey_run_id,
                journey,
                version,
                decision_context,
                received_at,
                started_at,
                last_event_received_at
            )
            VALUES (
                :anonymous_session_uuid,
                :client_journey_run_id,
                :journey,
                :version,
                :decision_context,
                :received_at,
                :received_at,
                :received_at
            )
            ON CONFLICT (anonymous_session_uuid, client_journey_run_id)
            DO UPDATE SET
                journey = EXCLUDED.journey,
                version = EXCLUDED.version,
                decision_context = EXCLUDED.decision_context,
                last_event_received_at = EXCLUDED.last_event_received_at,
                updated_at = now()
            RETURNING journey_run_uuid, client_journey_run_id
            """
        ),
        {
            "anonymous_session_uuid": anonymous_session_uuid,
            "client_journey_run_id": client_journey_run_id,
            "journey": journey,
            "version": version,
            "decision_context": decision_context,
            "received_at": received_at,
        },
    ).mappings().one()


def upsert_campaign_attribution(
    db: Session,
    *,
    anonymous_session_uuid: str,
    journey_run_uuid: str,
    touch_kind: str,
    payload: dict[str, Any],
    received_at: datetime,
) -> None:
    params = {
        "anonymous_session_uuid": anonymous_session_uuid,
        "journey_run_uuid": journey_run_uuid,
        "touch_kind": touch_kind,
        "utm_source": payload.get("utm_source"),
        "utm_medium": payload.get("utm_medium"),
        "utm_campaign": payload.get("utm_campaign"),
        "utm_content": payload.get("utm_content"),
        "utm_term": payload.get("utm_term"),
        "landing_path": payload["landing_path"],
        "referrer": payload.get("referrer"),
        "received_at": received_at,
    }
    if touch_kind == "first_touch":
        db.execute(
            text(
                """
                INSERT INTO campaign_attribution (
                    anonymous_session_uuid,
                    journey_run_uuid,
                    touch_kind,
                    utm_source,
                    utm_medium,
                    utm_campaign,
                    utm_content,
                    utm_term,
                    landing_path,
                    referrer,
                    received_at
                )
                VALUES (
                    :anonymous_session_uuid,
                    :journey_run_uuid,
                    :touch_kind,
                    :utm_source,
                    :utm_medium,
                    :utm_campaign,
                    :utm_content,
                    :utm_term,
                    :landing_path,
                    :referrer,
                    :received_at
                )
                ON CONFLICT (anonymous_session_uuid, touch_kind) DO NOTHING
                """
            ),
            params,
        )
        return

    db.execute(
        text(
            """
            INSERT INTO campaign_attribution (
                anonymous_session_uuid,
                journey_run_uuid,
                touch_kind,
                utm_source,
                utm_medium,
                utm_campaign,
                utm_content,
                utm_term,
                landing_path,
                referrer,
                received_at
            )
            VALUES (
                :anonymous_session_uuid,
                :journey_run_uuid,
                :touch_kind,
                :utm_source,
                :utm_medium,
                :utm_campaign,
                :utm_content,
                :utm_term,
                :landing_path,
                :referrer,
                :received_at
            )
            ON CONFLICT (anonymous_session_uuid, touch_kind)
            DO UPDATE SET
                journey_run_uuid = EXCLUDED.journey_run_uuid,
                utm_source = EXCLUDED.utm_source,
                utm_medium = EXCLUDED.utm_medium,
                utm_campaign = EXCLUDED.utm_campaign,
                utm_content = EXCLUDED.utm_content,
                utm_term = EXCLUDED.utm_term,
                landing_path = EXCLUDED.landing_path,
                referrer = EXCLUDED.referrer,
                received_at = EXCLUDED.received_at,
                updated_at = now()
            """
        ),
        params,
    )


def insert_product_event(
    db: Session,
    *,
    anonymous_session_uuid: str,
    journey_run_uuid: str,
    event_id: str,
    event_type: str,
    journey: str,
    version: str,
    decision_context: str,
    card_check_number: int | None,
    client_occurred_at: datetime,
    effective_occurred_at: datetime,
    received_at: datetime,
    client_clock_skew_seconds: int,
    client_clock_skew_status: str,
    screen_name: str | None = None,
) -> dict[str, Any]:
    inserted = db.execute(
        text(
            """
            INSERT INTO product_events (
                anonymous_session_uuid,
                journey_run_uuid,
                event_id,
                event_type,
                journey,
                version,
                decision_context,
                card_check_number,
                screen_name,
                client_occurred_at,
                effective_occurred_at,
                received_at,
                client_clock_skew_seconds,
                client_clock_skew_status
            )
            VALUES (
                :anonymous_session_uuid,
                :journey_run_uuid,
                :event_id,
                :event_type,
                :journey,
                :version,
                :decision_context,
                :card_check_number,
                :screen_name,
                :client_occurred_at,
                :effective_occurred_at,
                :received_at,
                :client_clock_skew_seconds,
                :client_clock_skew_status
            )
            ON CONFLICT (anonymous_session_uuid, event_id) DO NOTHING
            RETURNING product_event_uuid, event_id, event_type, journey_run_uuid, version, client_occurred_at, received_at, journey, decision_context, card_check_number, screen_name
            """
        ),
        {
            "anonymous_session_uuid": anonymous_session_uuid,
            "journey_run_uuid": journey_run_uuid,
            "event_id": event_id,
            "event_type": event_type,
            "journey": journey,
            "version": version,
            "decision_context": decision_context,
            "card_check_number": card_check_number,
            "screen_name": screen_name,
            "client_occurred_at": client_occurred_at,
            "effective_occurred_at": effective_occurred_at,
            "received_at": received_at,
            "client_clock_skew_seconds": client_clock_skew_seconds,
            "client_clock_skew_status": client_clock_skew_status,
        },
    ).mappings().first()
    if inserted is not None:
        result = dict(inserted)
        result["status"] = "persisted"
        return result

    existing = db.execute(
        text(
            """
            SELECT product_event_uuid, event_id, event_type, journey_run_uuid, version, client_occurred_at, received_at, journey, decision_context, card_check_number, screen_name
            FROM product_events
            WHERE anonymous_session_uuid = :anonymous_session_uuid
              AND event_id = :event_id
            """
        ),
        {"anonymous_session_uuid": anonymous_session_uuid, "event_id": event_id},
    ).mappings().one()
    result = dict(existing)
    result["status"] = "persisted"
    return result


def insert_continuation_intent(
    db: Session,
    *,
    anonymous_session_uuid: str,
    journey_run_uuid: str,
    product_event_uuid: str,
    journey: str,
    source_event_type: str,
    intent: str,
    reason: str | None,
    received_at: datetime,
) -> None:
    db.execute(
        text(
            """
            INSERT INTO continuation_intents (
                anonymous_session_uuid,
                journey_run_uuid,
                product_event_uuid,
                journey,
                source_event_type,
                intent,
                reason,
                received_at
            )
            VALUES (
                :anonymous_session_uuid,
                :journey_run_uuid,
                :product_event_uuid,
                :journey,
                :source_event_type,
                :intent,
                :reason,
                :received_at
            )
            ON CONFLICT DO NOTHING
            """
        ),
        {
            "anonymous_session_uuid": anonymous_session_uuid,
            "journey_run_uuid": journey_run_uuid,
            "product_event_uuid": product_event_uuid,
            "journey": journey,
            "source_event_type": source_event_type,
            "intent": intent,
            "reason": reason,
            "received_at": received_at,
        },
    )