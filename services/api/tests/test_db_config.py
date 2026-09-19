from __future__ import annotations

import traceback

import pytest

from app.db.config import DatabaseConfigError, DatabaseNotConfiguredError, get_database_settings


def test_valid_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:5432/sutriva_phasea_test")
    monkeypatch.setenv("DATABASE_REQUIRED", "true")

    settings = get_database_settings()

    assert settings.database_required is True
    assert settings.database_url is not None
    assert settings.pool_size == 5


def test_malformed_database_url_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "not-a-url")

    with pytest.raises(DatabaseConfigError):
        get_database_settings()


def test_missing_url_allowed_when_not_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_REQUIRED", "false")

    settings = get_database_settings()
    assert settings.database_url is None
    assert settings.database_required is False


def test_missing_url_fails_when_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_REQUIRED", "true")

    with pytest.raises(DatabaseNotConfiguredError):
        get_database_settings()


def test_boolean_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "yes")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:5432/sutriva_phasea_test")
    assert get_database_settings().database_required is True

    monkeypatch.setenv("DATABASE_REQUIRED", "off")
    assert get_database_settings().database_required is False


def test_boolean_parsing_rejects_invalid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "sometimes")

    with pytest.raises(DatabaseConfigError):
        get_database_settings()


def test_pool_defaults_and_overrides(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:5432/sutriva_phasea_test")
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("DATABASE_POOL_SIZE", "7")
    monkeypatch.setenv("DATABASE_MAX_OVERFLOW", "3")
    monkeypatch.setenv("DATABASE_POOL_TIMEOUT", "9")
    monkeypatch.setenv("DATABASE_POOL_RECYCLE", "123")
    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "7")

    settings = get_database_settings()

    assert settings.pool_size == 7
    assert settings.max_overflow == 3
    assert settings.pool_timeout == 9
    assert settings.pool_recycle == 123
    assert settings.connect_timeout == 7


def test_connect_timeout_default_and_bounds(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:5432/sutriva_phasea_test")
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.delenv("DATABASE_CONNECT_TIMEOUT", raising=False)
    assert get_database_settings().connect_timeout == 3

    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "0")
    with pytest.raises(DatabaseConfigError):
        get_database_settings()

    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "-1")
    with pytest.raises(DatabaseConfigError):
        get_database_settings()

    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "31")
    with pytest.raises(DatabaseConfigError):
        get_database_settings()

    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "abc")
    with pytest.raises(DatabaseConfigError):
        get_database_settings()


def test_errors_do_not_expose_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://secret-user:secret-pass@127.0.0.1:5432")

    with pytest.raises(DatabaseConfigError) as exc:
        get_database_settings()

    message = str(exc.value)
    assert "secret-user" not in message
    assert "secret-pass" not in message


def test_repr_and_exception_chain_do_not_expose_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    sentinel = "phasea-sentinel-pass"
    monkeypatch.setenv(
        "DATABASE_URL",
        f"postgresql+psycopg://phasea-user:{sentinel}@127.0.0.1:5432/sutriva_phasea_test",
    )
    monkeypatch.setenv("DATABASE_REQUIRED", "true")

    settings = get_database_settings()
    assert sentinel not in repr(settings)
    assert sentinel not in str(settings)
    assert "phasea-user" not in repr(settings)

    bad = "postgresql+psycopg://phasea-user:phasea-sentinel-pass@"
    monkeypatch.setenv("DATABASE_URL", bad)
    with pytest.raises(DatabaseConfigError) as exc:
        get_database_settings()

    rendered = "".join(traceback.format_exception(exc.type, exc.value, exc.tb))
    assert "phasea-sentinel-pass" not in rendered
    assert "phasea-user" not in rendered


def test_environment_not_stuck_at_import_time(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setenv("DATABASE_REQUIRED", "false")
    first = get_database_settings()
    assert first.database_url is None

    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:5432/sutriva_phasea_test")
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    second = get_database_settings()
    assert second.database_required is True
    assert second.database_url is not None
