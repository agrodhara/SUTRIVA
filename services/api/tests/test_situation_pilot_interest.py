from __future__ import annotations

import asyncio
import importlib
from datetime import UTC, datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.db.engine import dispose_engine
from conftest import phaseb_origin


def _enable_track11a(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.routers.situation_pilot_interest.track11a_enabled", lambda: True)


def _configure_admin_token(monkeypatch: pytest.MonkeyPatch, token: str = "test-admin-token") -> None:
    monkeypatch.setenv("SITUATION_PILOT_INTEREST_ADMIN_TOKEN", token)


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    # Every call in this file goes through the same TestClient, which gives a fixed client host
    # ("testclient") — without a reset, per-IP limiter state would leak between unrelated tests.
    from app.routers.situation_pilot_interest import _admin_export_limiter, _submit_limiter

    _submit_limiter.reset()
    _admin_export_limiter.reset()
    yield


def _submit(client: TestClient, situation_key: str = "fee", email: str = "visitor@example.com", origin: str | None = None):
    headers = {"Origin": origin if origin is not None else phaseb_origin()}
    return client.post("/v1/situation-pilot-interest", json={"situation_key": situation_key, "email": email}, headers=headers)


def _admin_export(client: TestClient, token: str | None = "test-admin-token"):
    headers = {"X-Admin-Token": token} if token is not None else {}
    return client.get("/v1/situation-pilot-interest/admin/export", headers=headers)


@pytest.fixture()
def phaseb_app(phaseb_upgraded_database: str):
    """Like conftest.py's phaseb_client, but yields the raw FastAPI app instead of wrapping it in
    starlette's TestClient — which always reports its own peer as the literal string "testclient", not a
    real IP, and gives no way to override that. The trusted-proxy tests below need a *real*, controllable
    peer address to prove the fix, so they build their own httpx.Client per simulated peer from this."""
    import app.main as app_main

    dispose_engine()
    app_module = importlib.reload(app_main)
    try:
        yield app_module.app
    finally:
        dispose_engine()


def _client_with_peer(app, peer_ip: str) -> httpx.AsyncClient:
    # httpx's ASGITransport in this version is async-only (handle_async_request, no sync
    # handle_request) — starlette's own TestClient hides this behind a sync-looking API via an internal
    # portal, but gives no way to override the simulated peer, which these tests need. AsyncClient +
    # asyncio.run (see _run) is the direct, dependency-free way to get a controllable peer address.
    transport = httpx.ASGITransport(app=app, client=(peer_ip, 12345))
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


def _run(coro):
    return asyncio.run(coro)


async def _submit_http_async(client: httpx.AsyncClient, *, email: str, forwarded_for: str | None = None, situation_key: str = "fee"):
    headers = {"Origin": phaseb_origin()}
    if forwarded_for is not None:
        headers["X-Forwarded-For"] = forwarded_for
    return await client.post("/v1/situation-pilot-interest", json={"situation_key": situation_key, "email": email}, headers=headers)


def _row_count(postgres_test_url: str) -> int:
    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM situation_pilot_interest")).scalar_one()


# --- Flag gating -----------------------------------------------------------------------------


def test_submit_404s_when_track11a_is_disabled(phaseb_client: TestClient) -> None:
    # track11a_enabled() is not patched here: this exercises the real, committed-false default.
    assert _submit(phaseb_client).status_code == 404


# --- Origin protection -------------------------------------------------------------------------


def test_submit_rejects_a_missing_or_wrong_origin(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    assert _submit(phaseb_client, origin="").status_code in (400, 403)
    assert _submit(phaseb_client, origin="https://not-sutriva.example").status_code == 403


# --- Happy path, persistence and idempotency ---------------------------------------------------


def test_a_valid_submission_persists_and_returns_registered(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> None:
    _enable_track11a(monkeypatch)
    response = _submit(phaseb_client, situation_key="offer", email="visitor@example.com")
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "registered"}
    assert _row_count(postgres_test_url) == 1


def test_resubmitting_the_same_email_for_the_same_situation_is_idempotent(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> None:
    _enable_track11a(monkeypatch)
    first = _submit(phaseb_client, situation_key="offer", email="visitor@example.com")
    second = _submit(phaseb_client, situation_key="offer", email="visitor@example.com")
    assert first.json() == {"status": "registered"}
    assert second.json() == {"status": "already_registered"}
    assert _row_count(postgres_test_url) == 1


def test_email_is_normalized_before_dedupe_check(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> None:
    _enable_track11a(monkeypatch)
    first = _submit(phaseb_client, situation_key="offer", email="  Visitor@Example.COM  ")
    second = _submit(phaseb_client, situation_key="offer", email="visitor@example.com")
    assert first.json() == {"status": "registered"}
    assert second.json() == {"status": "already_registered"}
    assert _row_count(postgres_test_url) == 1


def test_the_same_email_for_a_different_situation_is_a_distinct_registration(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> None:
    _enable_track11a(monkeypatch)
    first = _submit(phaseb_client, situation_key="offer", email="visitor@example.com")
    second = _submit(phaseb_client, situation_key="rejected", email="visitor@example.com")
    assert first.json() == {"status": "registered"}
    assert second.json() == {"status": "registered"}
    assert _row_count(postgres_test_url) == 2


@pytest.mark.parametrize("situation_key,journey", [
    ("debt", "comfortable_borrowing"),
    ("purchase", "comfortable_borrowing"),
    ("offer", "comfortable_borrowing"),
    ("rejected", "comfortable_borrowing"),
    ("fee", "money_value"),
    ("fit", "money_value"),
    ("balance", "money_value"),
    ("multi", "money_value"),
    ("unused", "money_value"),
])
def test_every_situation_key_derives_its_correct_journey(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str, situation_key: str, journey: str
) -> None:
    _enable_track11a(monkeypatch)
    _configure_admin_token(monkeypatch)
    _submit(phaseb_client, situation_key=situation_key, email=f"{situation_key}@example.com")
    rows = _admin_export(phaseb_client).json()["rows"]
    matching = [r for r in rows if r["situation_key"] == situation_key]
    assert len(matching) == 1
    assert matching[0]["journey"] == journey


# --- Validation --------------------------------------------------------------------------------


def test_an_invalid_email_is_rejected(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> None:
    _enable_track11a(monkeypatch)
    response = _submit(phaseb_client, email="not-an-email")
    assert response.status_code == 422
    assert _row_count(postgres_test_url) == 0


def test_an_unknown_situation_key_is_rejected(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    response = _submit(phaseb_client, situation_key="not-a-real-situation")
    assert response.status_code == 422


def test_an_extra_field_is_rejected(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    response = phaseb_client.post(
        "/v1/situation-pilot-interest",
        json={"situation_key": "fee", "email": "visitor@example.com", "phone_number": "+919876543210"},
        headers={"Origin": phaseb_origin()},
    )
    assert response.status_code == 422


def test_a_journey_field_supplied_by_the_client_is_rejected_not_silently_dropped(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # journey is derived server-side from situation_key (see app/services/situation_pilot_interest.py) —
    # a caller cannot send its own, correct or otherwise.
    _enable_track11a(monkeypatch)
    response = phaseb_client.post(
        "/v1/situation-pilot-interest",
        json={"situation_key": "fee", "email": "visitor@example.com", "journey": "money_value"},
        headers={"Origin": phaseb_origin()},
    )
    assert response.status_code == 422


# --- Rate limiting -------------------------------------------------------------------------------


def test_submit_is_rate_limited_per_ip(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    monkeypatch.setenv("SITUATION_PILOT_INTEREST_SUBMIT_PER_IP_PER_HOUR", "2")
    assert _submit(phaseb_client, email="a@example.com").status_code == 200
    assert _submit(phaseb_client, email="b@example.com").status_code == 200
    limited = _submit(phaseb_client, email="c@example.com")
    assert limited.status_code == 429
    assert limited.json()["detail"] == "rate_limited"


# --- Trusted-proxy-aware rate limiting -----------------------------------------------------------
#
# The documented nginx reverse proxy (docs/execution/UAT_DEPLOYMENT.md) sits in front of this API, so
# every request's direct TCP peer is nginx's own address, not the visitor's, unless TRUSTED_PROXY_IPS
# names it. These prove both halves of that: the vulnerability if it is left unconfigured, and that
# configuring it correctly attributes each real visitor their own budget without opening an evasion route
# for anyone not actually connecting through the trusted proxy.


def test_without_trusted_proxy_config_every_visitor_behind_the_proxy_shares_one_budget(phaseb_app, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    monkeypatch.delenv("TRUSTED_PROXY_IPS", raising=False)
    monkeypatch.setenv("SITUATION_PILOT_INTEREST_SUBMIT_PER_IP_PER_HOUR", "1")

    async def _scenario():
        async with _client_with_peer(phaseb_app, "10.0.0.5") as client:
            # Both requests arrive from the same proxy peer, each forwarding a different real visitor's
            # address — but with no trusted proxy configured, the API has no way to tell them apart.
            first = await _submit_http_async(client, email="a@example.com", forwarded_for="203.0.113.1")
            second = await _submit_http_async(client, email="b@example.com", forwarded_for="203.0.113.2")
        return first, second

    first, second = _run(_scenario())
    assert first.status_code == 200
    assert second.status_code == 429, "documents the reported vulnerability: an unconfigured deployment shares one bucket for every visitor behind the proxy"


def test_with_trusted_proxy_configured_each_real_visitor_gets_an_independent_budget(phaseb_app, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.5")
    monkeypatch.setenv("SITUATION_PILOT_INTEREST_SUBMIT_PER_IP_PER_HOUR", "1")

    async def _scenario():
        async with _client_with_peer(phaseb_app, "10.0.0.5") as client:
            first = await _submit_http_async(client, email="a@example.com", forwarded_for="203.0.113.1")
            second = await _submit_http_async(client, email="b@example.com", forwarded_for="203.0.113.2")
            # The first visitor's own budget is still exhausted on a second attempt.
            first_again = await _submit_http_async(client, email="a2@example.com", forwarded_for="203.0.113.1")
        return first, second, first_again

    first, second, first_again = _run(_scenario())
    assert first.status_code == 200
    assert second.status_code == 200, "a second, different real visitor behind the same trusted proxy must not be blocked by the first visitor's limit"
    assert first_again.status_code == 429


def test_bypassing_the_trusted_proxy_cannot_evade_the_limit_via_the_header(phaseb_app, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    monkeypatch.setenv("TRUSTED_PROXY_IPS", "10.0.0.5")
    monkeypatch.setenv("SITUATION_PILOT_INTEREST_SUBMIT_PER_IP_PER_HOUR", "1")

    async def _scenario():
        # This caller connects directly — its peer is not the trusted proxy's address.
        async with _client_with_peer(phaseb_app, "198.51.100.9") as client:
            first = await _submit_http_async(client, email="c@example.com", forwarded_for="1.2.3.4")
            second = await _submit_http_async(client, email="d@example.com", forwarded_for="5.6.7.8")
        return first, second

    first, second = _run(_scenario())
    assert first.status_code == 200
    assert second.status_code == 429, "an untrusted peer must not be able to fabricate a fresh identity via X-Forwarded-For"


# --- Anonymous session linking (best-effort only) -----------------------------------------------


def test_a_valid_session_cookie_links_the_registration(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> None:
    _enable_track11a(monkeypatch)
    _configure_admin_token(monkeypatch)
    bootstrap = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    assert bootstrap.status_code == 200
    response = phaseb_client.post(
        "/v1/situation-pilot-interest",
        json={"situation_key": "fee", "email": "linked@example.com"},
        headers={"Origin": phaseb_origin()},
        cookies=bootstrap.cookies,
    )
    assert response.status_code == 200

    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        anonymous_session_uuid = conn.execute(
            text("SELECT anonymous_session_uuid FROM situation_pilot_interest WHERE email = 'linked@example.com'")
        ).scalar_one()
    assert anonymous_session_uuid is not None


def test_no_cookie_at_all_still_succeeds_with_no_link(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> None:
    _enable_track11a(monkeypatch)
    response = _submit(phaseb_client, email="unlinked@example.com")
    assert response.status_code == 200

    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        anonymous_session_uuid = conn.execute(
            text("SELECT anonymous_session_uuid FROM situation_pilot_interest WHERE email = 'unlinked@example.com'")
        ).scalar_one()
    assert anonymous_session_uuid is None


# --- Database failure must not be papered over as success ---------------------------------------


def test_a_database_error_surfaces_as_service_unavailable_not_success(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> None:
    _enable_track11a(monkeypatch)

    def _boom(*args, **kwargs):
        from sqlalchemy.exc import SQLAlchemyError

        raise SQLAlchemyError("simulated failure")

    monkeypatch.setattr("app.services.situation_pilot_interest.insert_situation_pilot_interest", _boom)
    response = _submit(phaseb_client, email="failure@example.com")
    assert response.status_code == 503
    assert response.json()["detail"] == "service_unavailable"
    assert _row_count(postgres_test_url) == 0


# --- Admin export: not public, fails closed, excludes emails from every other surface ------------


def test_admin_export_404s_when_no_token_is_configured(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    monkeypatch.delenv("SITUATION_PILOT_INTEREST_ADMIN_TOKEN", raising=False)
    assert _admin_export(phaseb_client, token="anything").status_code == 404


def test_admin_export_401s_on_a_missing_or_wrong_token(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    _configure_admin_token(monkeypatch)
    assert _admin_export(phaseb_client, token=None).status_code == 401
    assert _admin_export(phaseb_client, token="wrong-token").status_code == 401


def test_admin_export_returns_registrations_with_the_correct_token(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    _configure_admin_token(monkeypatch)
    _submit(phaseb_client, situation_key="fee", email="visitor@example.com")
    response = _admin_export(phaseb_client, token="test-admin-token")
    assert response.status_code == 200
    rows = response.json()["rows"]
    assert len(rows) == 1
    assert rows[0]["email"] == "visitor@example.com"
    assert rows[0]["situation_key"] == "fee"
    assert rows[0]["journey"] == "money_value"


def test_admin_export_is_excluded_from_the_openapi_schema(phaseb_client: TestClient) -> None:
    schema = phaseb_client.get("/openapi.json").json()
    assert "/v1/situation-pilot-interest/admin/export" not in schema["paths"]
    # The public submit route is intentionally still documented.
    assert "/v1/situation-pilot-interest" in schema["paths"]


def test_admin_export_route_itself_is_rate_limited(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11a(monkeypatch)
    _configure_admin_token(monkeypatch)
    monkeypatch.setenv("SITUATION_PILOT_INTEREST_ADMIN_EXPORT_PER_IP_PER_HOUR", "1")
    assert _admin_export(phaseb_client, token="test-admin-token").status_code == 200
    assert _admin_export(phaseb_client, token="test-admin-token").status_code == 429


# --- This feature must never leak an email into analytics ----------------------------------------


def _post_event(client: TestClient, **overrides) -> "object":
    bootstrap = client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    base = {
        "event_id": "evt-pilot-1",
        "event_type": "situation_pilot_interest_submitted",
        "journey_run_id": "run-1",
        "journey": "money_value",
        "version": "test",
        "timestamp": datetime.now(UTC).isoformat(),
        "screen_name": "rewards_fee_pilot",
    }
    base.update(overrides)
    return client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=bootstrap.cookies, json=base)


def test_the_pilot_form_event_type_requires_its_own_pilot_screen_name(phaseb_client: TestClient) -> None:
    ok = _post_event(phaseb_client)
    assert ok.status_code == 200, ok.text

    wrong_role = _post_event(phaseb_client, screen_name="rewards_fee_result")
    assert wrong_role.status_code == 422

    wrong_journey = _post_event(phaseb_client, journey="comfortable_borrowing", screen_name="rewards_fee_pilot")
    assert wrong_journey.status_code == 422


def test_the_events_model_has_no_field_that_could_ever_carry_an_email(phaseb_client: TestClient) -> None:
    response = _post_event(phaseb_client, email="visitor@example.com")
    # extra="forbid" on ProductEventRequest — an email field is rejected outright, not silently accepted
    # or silently dropped.
    assert response.status_code == 422


@pytest.mark.parametrize("screen_name", [
    "borrow_debt_pilot", "borrow_purchase_pilot", "borrow_offer_pilot", "borrow_rejected_pilot",
    "rewards_fee_pilot", "rewards_fit_pilot", "rewards_balance_pilot", "rewards_multi_pilot", "rewards_unused_pilot",
])
def test_every_situation_gets_a_pilot_screen_name_usable_by_step_viewed(phaseb_client: TestClient, screen_name: str) -> None:
    journey = "comfortable_borrowing" if screen_name.startswith("borrow_") else "money_value"
    bootstrap = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    response = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies=bootstrap.cookies,
        json={
            "event_id": f"evt-{screen_name}",
            "event_type": "step_viewed",
            "journey_run_id": "run-1",
            "journey": journey,
            "version": "test",
            "timestamp": datetime.now(UTC).isoformat(),
            "screen_name": screen_name,
        },
    )
    assert response.status_code == 200, (screen_name, response.text)


def test_alembic_head_is_0007(postgres_test_url: str, alembic_ini_path, clean_database: None) -> None:
    from alembic import command

    from conftest import mapped_runtime_database_url, phaseb_alembic_cfg

    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == "0007_situation_pilot_interest"
