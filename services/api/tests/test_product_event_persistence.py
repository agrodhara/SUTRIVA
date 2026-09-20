from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.services.anonymous_sessions import get_cookie_name
from conftest import phaseb_origin


def _bootstrap(client):
    return client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})


def _payload(**overrides):
    payload = {
        "event_id": "evt-123",
        "event_type": "door_selected",
        "journey_run_id": "run-123",
        "journey": "money_value",
        "card_check_number": 1,
        "version": "track-1.1a-prototype-2026-09-17",
        "timestamp": "2026-09-19T00:00:00Z",
        "decision_context": "local_demo",
    }
    payload.update(overrides)
    if payload.get("journey") != "money_value":
        payload.pop("card_check_number", None)
    return payload


def test_event_persists_with_session_scoped_idempotency(phaseb_client, phaseb_upgraded_database: str) -> None:
    boot = _bootstrap(phaseb_client)
    cookie = boot.cookies.get(get_cookie_name())

    first = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): cookie},
        json=_payload(),
    )
    second = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): cookie},
        json=_payload(),
    )
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["status"] == "persisted"
    assert second.json()["status"] == "persisted"

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM product_events")).scalar_one() == 1


def test_same_event_id_is_allowed_in_different_sessions(phaseb_client, phaseb_upgraded_database: str) -> None:
    first_cookie = _bootstrap(phaseb_client).cookies.get(get_cookie_name())
    second_cookie = phaseb_client.post(
        "/v1/anonymous-sessions/bootstrap",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): "invalid-token"},
    ).cookies.get(get_cookie_name())

    response_a = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies={get_cookie_name(): first_cookie}, json=_payload(event_id="evt-shared"))
    response_b = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies={get_cookie_name(): second_cookie}, json=_payload(event_id="evt-shared"))
    assert response_a.status_code == 200
    assert response_b.status_code == 200

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM product_events WHERE event_id = 'evt-shared'")) .scalar_one() == 2


def test_event_rejects_unknown_and_sensitive_fields(phaseb_client) -> None:
    cookie = _bootstrap(phaseb_client).cookies.get(get_cookie_name())
    response = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): cookie},
        json=_payload(monthly_income=100000, phone="9999999999"),
    )
    assert response.status_code == 422


def test_event_database_validation_unavailable_returns_503(monkeypatch, phaseb_client) -> None:
    cookie = _bootstrap(phaseb_client).cookies.get(get_cookie_name())
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:1/sutriva_phaseb_test")
    response = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): cookie},
        json=_payload(),
    )
    assert response.status_code == 503
    assert response.json() == {"detail": "service_unavailable"}


def test_event_insert_failure_returns_202_without_leaking_details(monkeypatch, phaseb_client) -> None:
    cookie = _bootstrap(phaseb_client).cookies.get(get_cookie_name())

    def fail_insert(*args, **kwargs):
        raise SQLAlchemyError("raw sql message")

    monkeypatch.setattr("app.services.product_events.insert_product_event", fail_insert)
    response = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): cookie},
        json=_payload(),
    )
    assert response.status_code == 202
    assert response.json()["status"] == "accepted_not_persisted"
    assert "raw sql message" not in response.text


def test_continuation_projection_conflict_is_noop_while_events_stay_persisted(phaseb_client, phaseb_upgraded_database: str) -> None:
    cookie = _bootstrap(phaseb_client).cookies.get(get_cookie_name())
    first_payload = _payload(
        event_id="evt-cont-1",
        event_type="next_interest_selected",
        journey_run_id="run-cont-1",
        intent="actual_card_value",
        first_touch_attribution={
            "utm_source": "google",
            "utm_medium": "cpc",
            "utm_campaign": "alpha",
            "landing_path": "/money-value",
        },
        latest_touch_attribution={
            "utm_source": "newsletter",
            "utm_medium": "email",
            "utm_campaign": "alpha-2",
            "landing_path": "/money-value",
        },
    )
    second_payload = _payload(
        event_id="evt-cont-2",
        event_type="next_interest_selected",
        journey_run_id="run-cont-1",
        intent="actual_card_value",
        first_touch_attribution={
            "utm_source": "google",
            "utm_medium": "cpc",
            "utm_campaign": "alpha",
            "landing_path": "/money-value",
        },
        latest_touch_attribution={
            "utm_source": "social",
            "utm_medium": "organic",
            "utm_campaign": "alpha-3",
            "landing_path": "/money-value",
        },
    )

    first = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): cookie},
        json=first_payload,
    )
    second = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies={get_cookie_name(): cookie},
        json=second_payload,
    )

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["status"] == "persisted"
    assert second.json()["status"] == "persisted"
    assert first.json()["status"] != "accepted_not_persisted"
    assert second.json()["status"] != "accepted_not_persisted"

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM product_events")).scalar_one() == 2
        assert conn.execute(text("SELECT COUNT(*) FROM continuation_intents")).scalar_one() == 1
        assert conn.execute(text("SELECT COUNT(*) FROM journey_runs")).scalar_one() == 1
        assert conn.execute(text("SELECT COUNT(*) FROM campaign_attribution")).scalar_one() == 2
        assert (
            conn.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM journey_runs
                    WHERE client_journey_run_id = 'run-cont-1'
                      AND last_event_received_at IS NOT NULL
                    """
                )
            ).scalar_one()
            == 1
        )
