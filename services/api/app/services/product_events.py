from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Dict, Optional

from sqlalchemy.exc import SQLAlchemyError

from app.db.config import get_database_settings
from app.db.session import get_session_factory
from app.models.product_event import ProductEventRequest
from app.repositories.anonymous_continuity import (
    insert_continuation_intent,
    insert_product_event,
    upsert_campaign_attribution,
    upsert_journey_run,
)
from app.services.anonymous_sessions import AnonymousSessionHttpError, validate_event_session


LOGGER = logging.getLogger(__name__)
_CLOCK_SKEW_WINDOW_SECONDS = 600
_CONTINUATION_EVENT_TYPES = {
    "next_interest_selected",
    "go_deeper_selected",
    "go_deeper_declined",
    "decline_reason_selected",
}


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _normalize_client_timestamp(client_timestamp: datetime, received_at: datetime) -> tuple[datetime, int, str]:
    skew_seconds = int((client_timestamp - received_at).total_seconds())
    if skew_seconds < -_CLOCK_SKEW_WINDOW_SECONDS:
        return received_at - timedelta(seconds=_CLOCK_SKEW_WINDOW_SECONDS), skew_seconds, "clamped_past"
    if skew_seconds > _CLOCK_SKEW_WINDOW_SECONDS:
        return received_at + timedelta(seconds=_CLOCK_SKEW_WINDOW_SECONDS), skew_seconds, "clamped_future"
    return client_timestamp, skew_seconds, "trusted"


def record_product_event(
    *,
    payload: ProductEventRequest,
    raw_token: str | None,
) -> tuple[Dict[str, Any], int]:
    settings = get_database_settings()
    session = get_session_factory(settings)()
    received_at = _utcnow()

    try:
        validated = validate_event_session(raw_token, session=session)
        effective_occurred_at, skew_seconds, skew_status = _normalize_client_timestamp(payload.timestamp, received_at)

        try:
            journey_run = upsert_journey_run(
                session,
                anonymous_session_uuid=validated.anonymous_session_uuid,
                client_journey_run_id=payload.journey_run_id,
                journey=payload.journey,
                version=payload.version,
                decision_context=payload.decision_context,
                received_at=received_at,
            )

            if payload.first_touch_attribution is not None:
                upsert_campaign_attribution(
                    session,
                    anonymous_session_uuid=validated.anonymous_session_uuid,
                    journey_run_uuid=journey_run["journey_run_uuid"],
                    touch_kind="first_touch",
                    payload=payload.first_touch_attribution.model_dump(),
                    received_at=received_at,
                )

            if payload.latest_touch_attribution is not None:
                upsert_campaign_attribution(
                    session,
                    anonymous_session_uuid=validated.anonymous_session_uuid,
                    journey_run_uuid=journey_run["journey_run_uuid"],
                    touch_kind="latest_touch",
                    payload=payload.latest_touch_attribution.model_dump(),
                    received_at=received_at,
                )

            event = insert_product_event(
                session,
                anonymous_session_uuid=validated.anonymous_session_uuid,
                journey_run_uuid=journey_run["journey_run_uuid"],
                event_id=payload.event_id,
                event_type=payload.event_type,
                journey=payload.journey,
                version=payload.version,
                decision_context=payload.decision_context,
                card_check_number=payload.card_check_number,
                client_occurred_at=payload.timestamp,
                effective_occurred_at=effective_occurred_at,
                received_at=received_at,
                client_clock_skew_seconds=skew_seconds,
                client_clock_skew_status=skew_status,
            )

            if payload.event_type in _CONTINUATION_EVENT_TYPES and payload.intent is not None:
                insert_continuation_intent(
                    session,
                    anonymous_session_uuid=validated.anonymous_session_uuid,
                    journey_run_uuid=journey_run["journey_run_uuid"],
                    product_event_uuid=event["product_event_uuid"],
                    journey=payload.journey,
                    source_event_type=payload.event_type,
                    intent=payload.intent,
                    reason=payload.reason,
                    received_at=received_at,
                )

            session.commit()
            return {
                "status": event["status"],
                "event_id": event["event_id"],
                "event_type": event["event_type"],
                "journey_run_id": journey_run["client_journey_run_id"],
                "version": event["version"],
                "timestamp": event["client_occurred_at"],
                "received_at": event["received_at"],
                "journey": event["journey"],
                "decision_context": event["decision_context"],
                "card_check_number": event["card_check_number"],
                "first_touch_attribution": payload.first_touch_attribution.model_dump() if payload.first_touch_attribution else None,
                "latest_touch_attribution": payload.latest_touch_attribution.model_dump() if payload.latest_touch_attribution else None,
                "intent": payload.intent,
                "reason": payload.reason,
            }, 200
        except SQLAlchemyError:
            session.rollback()
            LOGGER.warning(
                "product event not persisted",
                extra={
                    "category": "product_event_not_persisted",
                    "event_type": payload.event_type,
                    "journey": payload.journey,
                },
            )
            return {
                "status": "accepted_not_persisted",
                "event_id": payload.event_id,
                "event_type": payload.event_type,
                "journey_run_id": payload.journey_run_id,
                "version": payload.version,
                "timestamp": payload.timestamp,
                "received_at": received_at,
                "journey": payload.journey,
                "decision_context": payload.decision_context,
                "card_check_number": payload.card_check_number,
                "first_touch_attribution": payload.first_touch_attribution.model_dump() if payload.first_touch_attribution else None,
                "latest_touch_attribution": payload.latest_touch_attribution.model_dump() if payload.latest_touch_attribution else None,
                "intent": payload.intent,
                "reason": payload.reason,
            }, 202
    except AnonymousSessionHttpError:
        session.rollback()
        raise
    finally:
        session.close()
