from __future__ import annotations

import os
from contextlib import contextmanager

from alembic import command
from alembic.config import Config
import pytest
from sqlalchemy import create_engine, inspect, text

from conftest import resolve_phasea_destructive_test_url_from_env, validate_phasea_destructive_test_url


def _alembic_cfg(path: str, database_url: str) -> Config:
    cfg = Config(path)
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


@contextmanager
def _mapped_runtime_database_url(database_url: str):
    previous = os.getenv("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


def test_upgrade_current_and_repeatable(
    postgres_test_url: str,
    alembic_ini_path,
    clean_database: None,
) -> None:
    cfg = _alembic_cfg(str(alembic_ini_path), postgres_test_url)
    with _mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
        command.current(cfg)
        command.upgrade(cfg, "head")

    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == "0001_phase_a_baseline"


def test_downgrade_and_reupgrade(
    postgres_test_url: str,
    alembic_ini_path,
    clean_database: None,
) -> None:
    cfg = _alembic_cfg(str(alembic_ini_path), postgres_test_url)

    with _mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
        command.downgrade(cfg, "base")
        command.upgrade(cfg, "head")

    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == "0001_phase_a_baseline"


def test_no_business_tables_created(
    postgres_test_url: str,
    alembic_ini_path,
    clean_database: None,
) -> None:
    cfg = _alembic_cfg(str(alembic_ini_path), postgres_test_url)
    with _mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")

    engine = create_engine(postgres_test_url, future=True)
    inspector = inspect(engine)
    tables = sorted(inspector.get_table_names(schema="public"))

    assert tables == ["alembic_version"]


def test_alembic_works_when_ambient_database_url_is_unset(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_url: str,
    alembic_ini_path,
    clean_database: None,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert os.getenv("DATABASE_URL") is None

    cfg = _alembic_cfg(str(alembic_ini_path), postgres_test_url)
    with _mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
    assert os.getenv("DATABASE_URL") is None


def test_destructive_guard_rejects_missing_phasea_test_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("PHASEA_TEST_DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:5432/sutriva_phasea_test")
    monkeypatch.setenv("PHASEA_ALLOW_DESTRUCTIVE_DB_TESTS", "1")

    with pytest.raises(RuntimeError, match="PHASEA_TEST_DATABASE_URL"):
        resolve_phasea_destructive_test_url_from_env()


def test_destructive_guard_rejects_missing_or_false_opt_in(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PHASEA_TEST_DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:5432/sutriva_phasea_test")
    monkeypatch.delenv("PHASEA_ALLOW_DESTRUCTIVE_DB_TESTS", raising=False)

    with pytest.raises(RuntimeError, match="PHASEA_ALLOW_DESTRUCTIVE_DB_TESTS"):
        resolve_phasea_destructive_test_url_from_env()

    monkeypatch.setenv("PHASEA_ALLOW_DESTRUCTIVE_DB_TESTS", "0")
    with pytest.raises(RuntimeError, match="PHASEA_ALLOW_DESTRUCTIVE_DB_TESTS"):
        resolve_phasea_destructive_test_url_from_env()


def test_destructive_guard_rejects_remote_host() -> None:
    with pytest.raises(RuntimeError, match="localhost"):
        validate_phasea_destructive_test_url("postgresql+psycopg://user:pass@db.example.com:5432/sutriva_phasea_test")


def test_destructive_guard_rejects_missing_host() -> None:
    with pytest.raises(RuntimeError, match="explicit host"):
        validate_phasea_destructive_test_url("postgresql+psycopg:///sutriva_phasea_test")


def test_destructive_guard_rejects_non_suffix_name() -> None:
    with pytest.raises(RuntimeError, match="end with _test or _ci"):
        validate_phasea_destructive_test_url("postgresql+psycopg://user:pass@127.0.0.1:5432/phasea_test_data")


def test_destructive_guard_rejects_missing_database_name() -> None:
    with pytest.raises(RuntimeError, match="database name"):
        validate_phasea_destructive_test_url("postgresql+psycopg://user:pass@127.0.0.1:5432")


def test_destructive_guard_accepts_strict_local_suffix() -> None:
    result = validate_phasea_destructive_test_url(
        "postgresql+psycopg://user:pass@localhost:5432/sutriva_phasea_test"
    )
    assert result.endswith("/sutriva_phasea_test")
