from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.services.anonymous_sessions import get_cookie_name, rotate_anonymous_session_token
from conftest import phaseb_origin


def _bootstrap(client: TestClient):
    return client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})


def test_bootstrap_creates_cookie_and_session(phaseb_client: TestClient, phaseb_upgraded_database: str) -> None:
    response = _bootstrap(phaseb_client)
    assert response.status_code == 200
    body = response.json()
    assert body["session_status"] == "created"
    assert body["cookie_max_age_seconds"] == 7_776_000
    cookie = response.cookies.get(get_cookie_name())
    assert cookie

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        session_count = conn.execute(text("SELECT COUNT(*) FROM anonymous_sessions")).scalar_one()
        token_count = conn.execute(text("SELECT COUNT(*) FROM anonymous_session_tokens")).scalar_one()
        digest_length = conn.execute(text("SELECT octet_length(token_digest) FROM anonymous_session_tokens")).scalar_one()
    assert session_count == 1
    assert token_count == 1
    assert digest_length == 32


def test_bootstrap_continues_existing_valid_session(phaseb_client: TestClient) -> None:
    created = _bootstrap(phaseb_client)
    cookie_value = created.cookies.get(get_cookie_name())

    continued = phaseb_client.post(
        "/v1/anonymous-sessions/bootstrap",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): cookie_value},
    )
    assert continued.status_code == 200
    assert continued.json()["session_status"] == "continued"
    assert continued.cookies.get(get_cookie_name()) is None


def test_bootstrap_invalid_cookie_creates_fresh_session(phaseb_client: TestClient, phaseb_upgraded_database: str) -> None:
    response = phaseb_client.post(
        "/v1/anonymous-sessions/bootstrap",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): "not-a-real-token"},
    )
    assert response.status_code == 200
    assert response.json()["session_status"] == "created"
    assert response.cookies.get(get_cookie_name())

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM anonymous_sessions")).scalar_one() == 1


def test_bootstrap_rejects_invalid_origin(phaseb_client: TestClient) -> None:
    response = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": "http://evil.example"})
    assert response.status_code == 403
    assert response.json() == {"detail": "invalid_origin"}


def test_bootstrap_database_unavailable_returns_503(monkeypatch, phaseb_client: TestClient) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:1/sutriva_phaseb_test")
    response = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    assert response.status_code == 503
    assert response.json() == {"detail": "service_unavailable"}


def test_rotation_does_not_change_parent_absolute_expiry(phaseb_client: TestClient, phaseb_upgraded_database: str) -> None:
    created = _bootstrap(phaseb_client)
    original_token = created.cookies.get(get_cookie_name())
    result = rotate_anonymous_session_token(original_token)
    assert result.raw_token

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        session_expiry = conn.execute(text("SELECT absolute_expires_at FROM anonymous_sessions")).scalar_one()
        token_expiries = conn.execute(text("SELECT DISTINCT original_absolute_expires_at FROM anonymous_session_tokens")).scalars().all()
    assert len(token_expiries) == 1
    assert token_expiries[0] == session_expiry
