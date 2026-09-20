from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, text

from app.services.anonymous_retention import purge_anonymous_data_batch


def test_retention_purge_uses_authoritative_columns_and_is_rerunnable(phaseb_upgraded_database: str) -> None:
    engine = create_engine(phaseb_upgraded_database, future=True)
    now = datetime.now(UTC)
    old = now - timedelta(days=181)
    fresh = now - timedelta(days=10)
    expires = now + timedelta(days=60)

    with engine.begin() as conn:
        session_uuid = conn.execute(
            text(
                "INSERT INTO anonymous_sessions (first_seen_at, last_seen_at, absolute_expires_at, status) VALUES (:now, :now, :expires, 'active') RETURNING anonymous_session_uuid"
            ),
            {"now": now, "expires": expires},
        ).scalar_one()
        token_uuid = conn.execute(
            text(
                "INSERT INTO anonymous_session_tokens (anonymous_session_uuid, token_digest, issued_at, original_absolute_expires_at, rotation_reason, is_active) VALUES (:session_uuid, :digest, :old, :expires, 'issued', false) RETURNING anonymous_session_token_uuid"
            ),
            {"session_uuid": session_uuid, "digest": b"a" * 32, "old": old, "expires": expires},
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO anonymous_session_tokens (anonymous_session_uuid, token_digest, issued_at, original_absolute_expires_at, rotation_reason, is_active) VALUES (:session_uuid, :digest, :old, :expires, 'issued', false)"
            ),
            {"session_uuid": session_uuid, "digest": b"b" * 32, "old": old, "expires": expires},
        )
        run_uuid = conn.execute(
            text(
                "INSERT INTO journey_runs (anonymous_session_uuid, client_journey_run_id, journey, version, decision_context, received_at, started_at, created_at) VALUES (:session_uuid, 'run-old', 'money_value', 'v1', 'local_demo', :old, :old, :old) RETURNING journey_run_uuid"
            ),
            {"session_uuid": session_uuid, "old": old},
        ).scalar_one()
        event_uuid = conn.execute(
            text(
                "INSERT INTO product_events (anonymous_session_uuid, journey_run_uuid, event_id, event_type, journey, version, decision_context, client_occurred_at, effective_occurred_at, received_at, client_clock_skew_seconds, client_clock_skew_status, created_at) VALUES (:session_uuid, :run_uuid, 'evt-old', 'door_selected', 'money_value', 'v1', 'local_demo', :old, :old, :old, 0, 'trusted', :old) RETURNING product_event_uuid"
            ),
            {"session_uuid": session_uuid, "run_uuid": run_uuid, "old": old},
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO campaign_attribution (anonymous_session_uuid, journey_run_uuid, touch_kind, landing_path, received_at, created_at) VALUES (:session_uuid, :run_uuid, 'latest_touch', '/money-value', :old, :old)"
            ),
            {"session_uuid": session_uuid, "run_uuid": run_uuid, "old": old},
        )
        conn.execute(
            text(
                "INSERT INTO continuation_intents (anonymous_session_uuid, journey_run_uuid, product_event_uuid, journey, source_event_type, intent, reason, received_at, created_at) VALUES (:session_uuid, :run_uuid, :event_uuid, 'money_value', 'next_interest_selected', 'actual_card_value', NULL, :old, :old)"
            ),
            {"session_uuid": session_uuid, "run_uuid": run_uuid, "event_uuid": event_uuid, "old": old},
        )
        conn.execute(
            text(
                "UPDATE anonymous_session_tokens SET issued_at = :fresh WHERE anonymous_session_token_uuid = :token_uuid"
            ),
            {"fresh": fresh, "token_uuid": token_uuid},
        )

    first = purge_anonymous_data_batch(batch_size=10, now=now)
    second = purge_anonymous_data_batch(batch_size=10, now=now)

    assert first.continuation_intents_deleted == 1
    assert first.campaign_attribution_deleted == 1
    assert first.product_events_deleted == 1
    assert first.journey_runs_deleted == 1
    assert first.anonymous_session_tokens_deleted == 1
    assert first.anonymous_sessions_deleted == 0

    assert second.continuation_intents_deleted == 0
    assert second.campaign_attribution_deleted == 0
    assert second.product_events_deleted == 0
    assert second.journey_runs_deleted == 0
    assert second.anonymous_session_tokens_deleted == 0
    assert second.anonymous_sessions_deleted == 0
    assert second.total_deleted == 0

    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM continuation_intents")).scalar_one() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM campaign_attribution")).scalar_one() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM product_events")).scalar_one() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM journey_runs")).scalar_one() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM anonymous_session_tokens")).scalar_one() == 1
        assert conn.execute(text("SELECT COUNT(*) FROM anonymous_sessions")).scalar_one() == 1
        assert conn.execute(text("SELECT COUNT(*) FROM anonymous_session_tokens WHERE token_digest = :digest"), {"digest": b"a" * 32}).scalar_one() == 1
        assert conn.execute(text("SELECT COUNT(*) FROM anonymous_session_tokens WHERE token_digest = :digest"), {"digest": b"b" * 32}).scalar_one() == 0
