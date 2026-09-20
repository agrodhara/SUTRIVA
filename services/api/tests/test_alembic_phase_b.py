from __future__ import annotations

from alembic import command
from sqlalchemy import create_engine, inspect, text

from conftest import mapped_runtime_database_url, phaseb_alembic_cfg


def test_phaseb_upgrade_current_and_repeatable(
    postgres_test_url: str,
    alembic_ini_path,
    clean_database: None,
) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
        command.current(cfg)
        command.upgrade(cfg, "head")

    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == "0003_product_event_screen_name"


def test_phaseb_downgrade_and_reupgrade(
    postgres_test_url: str,
    alembic_ini_path,
    clean_database: None,
) -> None:
    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")

    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == "0003_product_event_screen_name"


def test_phaseb_schema_contains_expected_tables_indexes_and_triggers(
    phaseb_upgraded_database: str,
) -> None:
    engine = create_engine(phaseb_upgraded_database, future=True)
    inspector = inspect(engine)
    tables = set(inspector.get_table_names(schema="public"))

    assert {
        "alembic_version",
        "anonymous_sessions",
        "anonymous_session_tokens",
        "journey_runs",
        "product_events",
        "campaign_attribution",
        "continuation_intents",
    } <= tables
    assert "contacts" not in tables
    assert "otp_sessions" not in tables
    assert "consents" not in tables

    with engine.connect() as conn:
        indexes = {row[0]: row[1] for row in conn.execute(text("SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'"))}
        triggers = set(conn.execute(text("SELECT tgname FROM pg_trigger WHERE NOT tgisinternal")).scalars())

    assert "uq_session_one_primary_token" in indexes
    assert "WHERE (is_active AND (grace_expires_at IS NULL))" in indexes["uq_session_one_primary_token"]
    assert "uq_session_one_grace_token" in indexes
    assert "COALESCE(reason, ''::text)" in indexes["uq_continuation_intents_session_run_event_intent_reason"]
    assert "trg_anonymous_sessions_updated_at" in triggers
    assert "trg_journey_runs_updated_at" in triggers
    assert "trg_product_events_updated_at" in triggers
    assert "trg_campaign_attribution_updated_at" in triggers
    assert "trg_continuation_intents_updated_at" in triggers
