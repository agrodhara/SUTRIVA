from __future__ import annotations

from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.db.config import get_database_settings
from app.db.engine import _build_engine, _settings_key, dispose_engine, get_engine
from app.db.session import get_session_factory, session_scope


def _configure_env(monkeypatch: pytest.MonkeyPatch, url: str) -> None:
    monkeypatch.setenv("DATABASE_URL", url)
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("DATABASE_POOL_SIZE", "2")
    monkeypatch.setenv("DATABASE_MAX_OVERFLOW", "1")
    monkeypatch.setenv("DATABASE_POOL_TIMEOUT", "5")
    monkeypatch.setenv("DATABASE_POOL_RECYCLE", "60")
    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "4")


def test_engine_construction_and_pool_settings(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_url: str,
    clean_database: None,
) -> None:
    _configure_env(monkeypatch, postgres_test_url)
    dispose_engine()

    settings = get_database_settings()
    engine = get_engine(settings)

    assert engine.dialect.name == "postgresql"
    assert engine.pool._pre_ping is True
    assert engine.pool.size() == 2

    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar_one() == 1


def test_build_engine_passes_connect_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:5432/sutriva_phasea_test")
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "6")

    captured: dict[str, object] = {}

    def fake_create_engine(url: str, **kwargs: object) -> object:
        captured["url"] = url
        captured["kwargs"] = kwargs
        return SimpleNamespace(dispose=lambda: None)

    monkeypatch.setattr("app.db.engine.create_engine", fake_create_engine)

    settings = get_database_settings()
    _build_engine(settings)

    kwargs = captured["kwargs"]
    assert kwargs["connect_args"] == {"connect_timeout": 6}


def test_session_commit_and_cleanup(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_url: str,
    clean_database: None,
) -> None:
    _configure_env(monkeypatch, postgres_test_url)
    dispose_engine()

    settings = get_database_settings()
    with session_scope(settings) as session:
        session.execute(text("CREATE TABLE IF NOT EXISTS phasea_commit_check(id INTEGER PRIMARY KEY)"))
        session.execute(text("INSERT INTO phasea_commit_check(id) VALUES (1)"))

    with session_scope(settings) as session:
        count = session.execute(text("SELECT COUNT(*) FROM phasea_commit_check")).scalar_one()
        assert count == 1


def test_session_rollback_on_exception(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_url: str,
    clean_database: None,
) -> None:
    _configure_env(monkeypatch, postgres_test_url)
    dispose_engine()

    settings = get_database_settings()
    with session_scope(settings) as session:
        session.execute(text("CREATE TABLE IF NOT EXISTS phasea_rollback_check(id INTEGER PRIMARY KEY)"))

    with pytest.raises(RuntimeError):
        with session_scope(settings) as session:
            session.execute(text("INSERT INTO phasea_rollback_check(id) VALUES (1)"))
            raise RuntimeError("trigger rollback")

    with session_scope(settings) as session:
        count = session.execute(text("SELECT COUNT(*) FROM phasea_rollback_check")).scalar_one()
        assert count == 0


def test_session_factory_produces_closeable_sessions(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_url: str,
    clean_database: None,
) -> None:
    _configure_env(monkeypatch, postgres_test_url)
    dispose_engine()

    settings = get_database_settings()
    factory = get_session_factory(settings)
    session = factory()
    assert session.is_active
    session.close()
    assert not session.in_transaction()


def test_engine_dispose_and_recreate(
    monkeypatch: pytest.MonkeyPatch,
    postgres_test_url: str,
    clean_database: None,
) -> None:
    _configure_env(monkeypatch, postgres_test_url)
    dispose_engine()

    settings = get_database_settings()
    first = get_engine(settings)
    dispose_engine()
    second = get_engine(settings)

    assert first is not second


def test_engine_key_repr_is_redacted_but_changes_with_password(monkeypatch: pytest.MonkeyPatch) -> None:
    sentinel_a = "phasea-sentinel-a"
    sentinel_b = "phasea-sentinel-b"

    monkeypatch.setenv(
        "DATABASE_URL",
        f"postgresql+psycopg://phasea-user:{sentinel_a}@127.0.0.1:5432/sutriva_phasea_test",
    )
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    first = _settings_key(get_database_settings())

    monkeypatch.setenv(
        "DATABASE_URL",
        f"postgresql+psycopg://phasea-user:{sentinel_b}@127.0.0.1:5432/sutriva_phasea_test",
    )
    second = _settings_key(get_database_settings())

    assert first != second
    assert sentinel_a not in repr(first)
    assert sentinel_a not in str(first)
    assert "phasea-user" not in repr(first)
