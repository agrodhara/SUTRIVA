from __future__ import annotations

import pytest
from alembic import command
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from conftest import mapped_runtime_database_url, phaseb_alembic_cfg

PREVIOUS_REVISION = "0007_situation_pilot_interest"
REVISION = "0008_group_landing_screen_name"
CONSTRAINT = "ck_product_events_screen_name"


def _constraint_def(engine) -> str | None:
    with engine.connect() as conn:
        return conn.execute(
            text("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = :n AND conrelid = 'product_events'::regclass"),
            {"n": CONSTRAINT},
        ).scalar()


def _seed_parents(conn):
    session_uuid = conn.execute(
        text("INSERT INTO anonymous_sessions (absolute_expires_at) VALUES (now() + interval '1 day') RETURNING anonymous_session_uuid")
    ).scalar_one()
    run_uuid = conn.execute(
        text(
            "INSERT INTO journey_runs (anonymous_session_uuid, client_journey_run_id, journey, version) "
            "VALUES (:s, 'run', 'money_value', 'v') RETURNING journey_run_uuid"
        ),
        {"s": session_uuid},
    ).scalar_one()
    return session_uuid, run_uuid


def _insert_event(conn, session_uuid, run_uuid, event_id: str, screen_name: str) -> None:
    conn.execute(
        text(
            "INSERT INTO product_events (anonymous_session_uuid, journey_run_uuid, event_id, event_type, journey, "
            "version, client_occurred_at, effective_occurred_at, client_clock_skew_status, screen_name) "
            "VALUES (:s, :r, :e, 'step_viewed', 'money_value', 'v', now(), now(), 'trusted', :n)"
        ),
        {"s": session_uuid, "r": run_uuid, "e": event_id, "n": screen_name},
    )


def test_upgrade_widens_the_allowlist_additively(postgres_test_url: str, alembic_ini_path, clean_database: None) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    engine = create_engine(postgres_test_url, future=True)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, PREVIOUS_REVISION)
        before = _constraint_def(engine)
        assert "rewards_group_landing" not in before
        assert "rewards_check" in before  # a pre-existing value stays present

        command.upgrade(cfg, REVISION)
        after = _constraint_def(engine)
    assert "rewards_group_landing" in after
    assert "borrow_group_landing" in after
    assert "rewards_check" in after  # unchanged by the widening


def test_downgrade_is_clean_when_no_row_uses_the_new_values(
    postgres_test_url: str, alembic_ini_path, clean_database: None
) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    engine = create_engine(postgres_test_url, future=True)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
        with engine.begin() as conn:
            session_uuid, run_uuid = _seed_parents(conn)
            _insert_event(conn, session_uuid, run_uuid, "pre-existing-value", "rewards_check")

        # No row uses a Milestone-1 screen name — downgrade must succeed without error.
        command.downgrade(cfg, PREVIOUS_REVISION)
        after_down = _constraint_def(engine)
        assert "rewards_group_landing" not in after_down

        command.upgrade(cfg, "head")
        after_up = _constraint_def(engine)
    assert "rewards_group_landing" in after_up
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM product_events WHERE event_id = 'pre-existing-value'")).scalar_one() == 1


def test_downgrade_fails_loudly_once_a_new_screen_name_row_exists(
    postgres_test_url: str, alembic_ini_path, clean_database: None
) -> None:
    # The practical rollback plan documented in SITUATIONS_REDESIGN.md depends on this being true: once real
    # traffic has used either new screen name, `alembic downgrade` must not silently succeed (which would
    # imply either silent data loss or an inconsistent schema) — it must fail outright, loudly, leaving the
    # schema at 0008, so an operator is never left thinking a downgrade worked when it didn't.
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    engine = create_engine(postgres_test_url, future=True)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
        with engine.begin() as conn:
            session_uuid, run_uuid = _seed_parents(conn)
            _insert_event(conn, session_uuid, run_uuid, "uses-new-value", "rewards_group_landing")

        with pytest.raises(IntegrityError, match="ck_product_events_screen_name"):
            command.downgrade(cfg, PREVIOUS_REVISION)

    # The schema is left at head — the failed downgrade did not partially apply.
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == REVISION
