from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from app.db.config import get_database_settings
from app.db.session import get_session_factory
from app.session_config import get_anonymous_session_settings
from sqlalchemy import text


@dataclass(frozen=True)
class PurgeBatchResult:
    continuation_intents_deleted: int
    campaign_attribution_deleted: int
    product_events_deleted: int
    journey_runs_deleted: int
    anonymous_session_tokens_deleted: int
    anonymous_sessions_deleted: int

    @property
    def total_deleted(self) -> int:
        return (
            self.continuation_intents_deleted
            + self.campaign_attribution_deleted
            + self.product_events_deleted
            + self.journey_runs_deleted
            + self.anonymous_session_tokens_deleted
            + self.anonymous_sessions_deleted
        )


def _utcnow() -> datetime:
    return datetime.now(UTC)


def purge_anonymous_data_batch(batch_size: int | None = None, now: datetime | None = None) -> PurgeBatchResult:
    settings = get_anonymous_session_settings()
    cutoff_now = now or _utcnow()
    current_batch_size = batch_size or settings.purge_batch_size
    history_cutoff = cutoff_now - timedelta(seconds=settings.history_retention_seconds)
    token_cutoff = cutoff_now - timedelta(seconds=settings.token_retention_seconds)

    session = get_session_factory(get_database_settings())()
    try:
        continuation_intents_deleted = session.execute(
            text(
                """
                WITH doomed AS (
                    SELECT continuation_intent_uuid
                    FROM continuation_intents
                    WHERE received_at < :history_cutoff
                    ORDER BY received_at ASC
                    LIMIT :batch_size
                )
                DELETE FROM continuation_intents
                WHERE continuation_intent_uuid IN (SELECT continuation_intent_uuid FROM doomed)
                """
            ),
            {"history_cutoff": history_cutoff, "batch_size": current_batch_size},
        ).rowcount or 0

        campaign_attribution_deleted = session.execute(
            text(
                """
                WITH doomed AS (
                    SELECT campaign_attribution_uuid
                    FROM campaign_attribution
                    WHERE received_at < :history_cutoff
                    ORDER BY received_at ASC
                    LIMIT :batch_size
                )
                DELETE FROM campaign_attribution
                WHERE campaign_attribution_uuid IN (SELECT campaign_attribution_uuid FROM doomed)
                """
            ),
            {"history_cutoff": history_cutoff, "batch_size": current_batch_size},
        ).rowcount or 0

        product_events_deleted = session.execute(
            text(
                """
                WITH doomed AS (
                    SELECT product_event_uuid
                    FROM product_events
                    WHERE received_at < :history_cutoff
                    ORDER BY received_at ASC
                    LIMIT :batch_size
                )
                DELETE FROM product_events
                WHERE product_event_uuid IN (SELECT product_event_uuid FROM doomed)
                """
            ),
            {"history_cutoff": history_cutoff, "batch_size": current_batch_size},
        ).rowcount or 0

        journey_runs_deleted = session.execute(
            text(
                """
                WITH doomed AS (
                    SELECT journey_run_uuid
                    FROM journey_runs
                    WHERE created_at < :history_cutoff
                    ORDER BY created_at ASC
                    LIMIT :batch_size
                )
                DELETE FROM journey_runs
                WHERE journey_run_uuid IN (SELECT journey_run_uuid FROM doomed)
                """
            ),
            {"history_cutoff": history_cutoff, "batch_size": current_batch_size},
        ).rowcount or 0

        anonymous_session_tokens_deleted = session.execute(
            text(
                """
                WITH doomed AS (
                    SELECT anonymous_session_token_uuid
                    FROM anonymous_session_tokens
                    WHERE issued_at < :token_cutoff
                    ORDER BY issued_at ASC
                    LIMIT :batch_size
                )
                DELETE FROM anonymous_session_tokens
                WHERE anonymous_session_token_uuid IN (SELECT anonymous_session_token_uuid FROM doomed)
                """
            ),
            {"token_cutoff": token_cutoff, "batch_size": current_batch_size},
        ).rowcount or 0

        anonymous_sessions_deleted = session.execute(
            text(
                """
                WITH doomed AS (
                    SELECT s.anonymous_session_uuid
                    FROM anonymous_sessions s
                    WHERE NOT EXISTS (
                        SELECT 1 FROM anonymous_session_tokens t WHERE t.anonymous_session_uuid = s.anonymous_session_uuid
                    )
                      AND NOT EXISTS (
                        SELECT 1 FROM journey_runs jr WHERE jr.anonymous_session_uuid = s.anonymous_session_uuid
                    )
                      AND NOT EXISTS (
                        SELECT 1 FROM product_events pe WHERE pe.anonymous_session_uuid = s.anonymous_session_uuid
                    )
                      AND NOT EXISTS (
                        SELECT 1 FROM campaign_attribution ca WHERE ca.anonymous_session_uuid = s.anonymous_session_uuid
                    )
                      AND NOT EXISTS (
                        SELECT 1 FROM continuation_intents ci WHERE ci.anonymous_session_uuid = s.anonymous_session_uuid
                    )
                    ORDER BY s.created_at ASC
                    LIMIT :batch_size
                )
                DELETE FROM anonymous_sessions
                WHERE anonymous_session_uuid IN (SELECT anonymous_session_uuid FROM doomed)
                """
            ),
            {"batch_size": current_batch_size},
        ).rowcount or 0

        session.commit()
        return PurgeBatchResult(
            continuation_intents_deleted=continuation_intents_deleted,
            campaign_attribution_deleted=campaign_attribution_deleted,
            product_events_deleted=product_events_deleted,
            journey_runs_deleted=journey_runs_deleted,
            anonymous_session_tokens_deleted=anonymous_session_tokens_deleted,
            anonymous_sessions_deleted=anonymous_sessions_deleted,
        )
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()