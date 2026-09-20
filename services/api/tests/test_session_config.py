from __future__ import annotations

import pytest

from app.session_config import SessionConfigError, get_anonymous_session_settings


def test_defaults_are_safe_for_local_development(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ANONYMOUS_SESSION_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST", raising=False)

    settings = get_anonymous_session_settings()

    assert settings.cookie_name == "sutriva_anon_session"
    assert settings.cookie_same_site == "lax"
    assert settings.cookie_path == "/"
    assert settings.cookie_max_age_seconds == 7_776_000
    assert settings.absolute_session_lifetime_seconds == 7_776_000
    assert settings.history_retention_seconds == 15_552_000
    assert settings.token_retention_seconds == 15_552_000
    assert settings.token_grace_period_seconds == 300
    assert settings.allowed_origins == (
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    )
    assert settings.allow_credentials is True
    assert settings.cookie_secure is True


def test_production_origin_must_be_in_custom_allowlist(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANONYMOUS_SESSION_ALLOWED_ORIGINS", "https://preview.sutriva.com")

    with pytest.raises(SessionConfigError, match="must include the production origin"):
        get_anonymous_session_settings()


def test_wildcard_origin_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANONYMOUS_SESSION_ALLOWED_ORIGINS", "*")

    with pytest.raises(SessionConfigError, match="Wildcard origins"):
        get_anonymous_session_settings()


def test_local_cookie_secure_override(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "ANONYMOUS_SESSION_ALLOWED_ORIGINS",
        "https://app.sutriva.com,http://127.0.0.1:3210",
    )
    monkeypatch.setenv("ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST", "true")

    settings = get_anonymous_session_settings()

    assert settings.cookie_secure is False
    assert settings.allowed_origins == ("https://app.sutriva.com", "http://127.0.0.1:3210")


def test_fixed_lifetime_and_retention_values_cannot_drift(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS", "7776001")

    with pytest.raises(SessionConfigError, match="must be <= 7776000"):
        get_anonymous_session_settings()

    monkeypatch.setenv("ANONYMOUS_SESSION_COOKIE_MAX_AGE_SECONDS", "7776000")
    monkeypatch.setenv("ANONYMOUS_SESSION_ABSOLUTE_LIFETIME_SECONDS", "7775999")
    with pytest.raises(SessionConfigError, match="must be >= 7776000"):
        get_anonymous_session_settings()

    monkeypatch.setenv("ANONYMOUS_SESSION_ABSOLUTE_LIFETIME_SECONDS", "7776000")
    monkeypatch.setenv("ANONYMOUS_HISTORY_RETENTION_SECONDS", "15551999")
    with pytest.raises(SessionConfigError, match="must be >= 15552000"):
        get_anonymous_session_settings()

    monkeypatch.setenv("ANONYMOUS_HISTORY_RETENTION_SECONDS", "15552000")
    monkeypatch.setenv("ANONYMOUS_TOKEN_RETENTION_SECONDS", "15552001")
    with pytest.raises(SessionConfigError, match="must be <= 15552000"):
        get_anonymous_session_settings()