from __future__ import annotations

import pytest
from alembic import command
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DataError, IntegrityError

from conftest import mapped_runtime_database_url, phaseb_alembic_cfg

PREVIOUS_REVISION = "0002_phase_b_anon_continuity"
NEW_REVISION = "0003_product_event_screen_name"
# The actual chain head as of this migration's own addition. Kept separate from NEW_REVISION (which this
# file's other assertions use to test the screen_name migration specifically, in isolation) so a later
# migration on top only ever requires updating this one constant.
LATEST_REVISION = "0005_otp_send_log"
CONSTRAINT = "ck_product_events_screen_name"
APPROVED = (
    "rewards_card_behaviour",
    "rewards_priorities_inputs",
    "rewards_check",
    "rewards_connected_example",
    "borrow_monthly_position",
    "borrow_plan",
    "borrow_check",
    "borrow_connected_example",
)


def _revision(engine) -> str:
    with engine.connect() as conn:
        return conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()


def _column(engine):
    return {c["name"]: c for c in inspect(engine).get_columns("product_events")}.get("screen_name")


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


def _insert_event(conn, session_uuid, run_uuid, event_id: str, screen_name: str | None, *, with_column: bool = True):
    columns = "anonymous_session_uuid, journey_run_uuid, event_id, event_type, journey, version, client_occurred_at, effective_occurred_at, client_clock_skew_status"
    values = ":s, :r, :e, 'step_viewed', 'money_value', 'v', now(), now(), 'trusted'"
    params = {"s": session_uuid, "r": run_uuid, "e": event_id}
    if with_column:
        columns += ", screen_name"
        values += ", :n"
        params["n"] = screen_name
    conn.execute(text(f"INSERT INTO product_events ({columns}) VALUES ({values})"), params)


def test_there_is_exactly_one_alembic_head(alembic_ini_path, postgres_test_url: str) -> None:
    script = ScriptDirectory.from_config(phaseb_alembic_cfg(alembic_ini_path, postgres_test_url))
    assert script.get_heads() == [LATEST_REVISION]
    assert script.get_revision(NEW_REVISION).down_revision == PREVIOUS_REVISION


def test_upgrade_adds_nullable_bounded_column_and_check_constraint(
    postgres_test_url: str, alembic_ini_path, clean_database: None
) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    engine = create_engine(postgres_test_url, future=True)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, PREVIOUS_REVISION)
        assert _column(engine) is None
        assert _constraint_def(engine) is None

        command.upgrade(cfg, "head")

    column = _column(engine)
    assert column is not None
    assert column["nullable"] is True
    assert column["type"].length == 32
    definition = _constraint_def(engine)
    assert definition is not None
    for name in APPROVED:
        assert f"'{name}'" in definition
    assert "IS NULL" in definition
    assert _revision(engine) == LATEST_REVISION


def test_check_constraint_accepts_null_and_all_eight_values_and_rejects_others(
    postgres_test_url: str, alembic_ini_path, clean_database: None
) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    engine = create_engine(postgres_test_url, future=True)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")

    with engine.begin() as conn:
        session_uuid, run_uuid = _seed_parents(conn)
        _insert_event(conn, session_uuid, run_uuid, "null-value", None)
        for index, name in enumerate(APPROVED):
            _insert_event(conn, session_uuid, run_uuid, f"ok-{index}", name)

    with engine.connect() as conn:
        stored = conn.execute(text("SELECT screen_name FROM product_events WHERE event_id LIKE 'ok-%'")).scalars().all()
        assert sorted(stored) == sorted(APPROVED)

    bad_values = ("", "unknown_screen", "REWARDS_CHECK", "rewards_check ", "₹1,20,000", "14%", "x" * 33, "x" * 40)
    for index, bad in enumerate(bad_values):
        # Over-length values are stopped by the column type (DataError); the rest by the check constraint.
        with pytest.raises((IntegrityError, DataError)):
            with engine.begin() as conn:
                _insert_event(conn, session_uuid, run_uuid, f"bad-{index}", bad)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM product_events")).scalar_one() == 1 + len(APPROVED)


def test_existing_rows_without_the_column_stay_valid_after_upgrade(
    postgres_test_url: str, alembic_ini_path, clean_database: None
) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    engine = create_engine(postgres_test_url, future=True)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, PREVIOUS_REVISION)
        with engine.begin() as conn:
            session_uuid, run_uuid = _seed_parents(conn)
            _insert_event(conn, session_uuid, run_uuid, "legacy-row", None, with_column=False)
        command.upgrade(cfg, "head")

    with engine.connect() as conn:
        row = conn.execute(text("SELECT event_id, screen_name FROM product_events")).mappings().one()
    assert row["event_id"] == "legacy-row"
    assert row["screen_name"] is None


def test_downgrade_removes_column_and_constraint_then_reupgrade_restores_them(
    postgres_test_url: str, alembic_ini_path, clean_database: None
) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    engine = create_engine(postgres_test_url, future=True)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
        with engine.begin() as conn:
            session_uuid, run_uuid = _seed_parents(conn)
            _insert_event(conn, session_uuid, run_uuid, "keep-me", "rewards_check")

        command.downgrade(cfg, PREVIOUS_REVISION)
        assert _revision(engine) == PREVIOUS_REVISION
        assert _column(engine) is None
        assert _constraint_def(engine) is None
        with engine.connect() as conn:
            assert conn.execute(text("SELECT count(*) FROM product_events WHERE event_id = 'keep-me'")).scalar_one() == 1

        command.upgrade(cfg, "head")

    assert _revision(engine) == LATEST_REVISION
    assert _column(engine) is not None
    assert _constraint_def(engine) is not None
    with engine.connect() as conn:
        # Data written before downgrade lost only the dropped column's value.
        assert conn.execute(text("SELECT screen_name FROM product_events WHERE event_id = 'keep-me'")).scalar_one() is None


def test_migration_adds_no_index_and_leaves_existing_constraints_and_foreign_keys_unchanged(
    postgres_test_url: str, alembic_ini_path, clean_database: None
) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    engine = create_engine(postgres_test_url, future=True)

    def snapshot() -> tuple[set[str], set[str], set[str]]:
        with engine.connect() as conn:
            indexes = set(conn.execute(text("SELECT indexname FROM pg_indexes WHERE tablename = 'product_events'")).scalars())
            constraints = set(
                conn.execute(text("SELECT conname FROM pg_constraint WHERE conrelid = 'product_events'::regclass")).scalars()
            )
            triggers = set(
                conn.execute(
                    text("SELECT tgname FROM pg_trigger WHERE tgrelid = 'product_events'::regclass AND NOT tgisinternal")
                ).scalars()
            )
        return indexes, constraints, triggers

    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, PREVIOUS_REVISION)
        before = snapshot()
        command.upgrade(cfg, "head")
        after = snapshot()

    assert after[0] == before[0]
    assert after[1] == before[1] | {CONSTRAINT}
    assert after[2] == before[2]
