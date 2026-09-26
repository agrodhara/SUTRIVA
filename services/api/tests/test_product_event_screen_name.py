from __future__ import annotations

import logging

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError

from app.models.product_event import (
    REQUIRED_SCREEN_NAMES_BY_EVENT_TYPE,
    SCREEN_NAME_JOURNEY,
    STEP_SCREEN_NAMES,
    ProductEventRequest,
)
from app.services.anonymous_sessions import get_cookie_name
from conftest import phaseb_origin

REWARDS = "money_value"
BORROW = "comfortable_borrowing"

_BORROW_SITUATIONS = ("borrow_debt", "borrow_purchase", "borrow_offer", "borrow_rejected")
_REWARDS_SITUATIONS = ("rewards_fee", "rewards_fit", "rewards_balance", "rewards_multi", "rewards_unused")

APPROVED_SCREEN_NAMES = {
    "rewards_card_behaviour": REWARDS,
    "rewards_priorities_inputs": REWARDS,
    "rewards_check": REWARDS,
    "rewards_connected_example": REWARDS,
    "borrow_monthly_position": BORROW,
    "borrow_plan": BORROW,
    "borrow_check": BORROW,
    "borrow_connected_example": BORROW,
    **{f"{key}_{suffix}": BORROW for key in _BORROW_SITUATIONS for suffix in ("arrival", "inputs", "result", "pilot")},
    **{f"{key}_{suffix}": REWARDS for key in _REWARDS_SITUATIONS for suffix in ("arrival", "inputs", "result", "pilot")},
}
STEP_NAMES = {
    "rewards_card_behaviour", "rewards_priorities_inputs", "borrow_monthly_position", "borrow_plan",
    *(f"{key}_{suffix}" for key in (*_BORROW_SITUATIONS, *_REWARDS_SITUATIONS) for suffix in ("arrival", "inputs")),
    # The pilot-interest form appearing after a result also reports "step_viewed" (see
    # apps/pwa/app/situations/PilotInterestForm.tsx), so its screen names are step names too.
    *(f"{key}_pilot" for key in (*_BORROW_SITUATIONS, *_REWARDS_SITUATIONS)),
}
CHECK_NAMES = {
    "rewards_check", "borrow_check",
    *(f"{key}_result" for key in (*_BORROW_SITUATIONS, *_REWARDS_SITUATIONS)),
}
# No situation has a fourth "connected example" screen — that concept belongs only to the two original,
# now-superseded comprehensive checks, so this set is deliberately not extended.
CONNECTED_NAMES = {"rewards_connected_example", "borrow_connected_example"}
# The pilot-interest form's own submission (migration 0007_situation_pilot_interest) — required by the
# "situation_pilot_interest_submitted" event type, exactly as CHECK_NAMES is required by "result_declared".
PILOT_NAMES = {f"{key}_pilot" for key in (*_BORROW_SITUATIONS, *_REWARDS_SITUATIONS)}


def _body(**overrides):
    body = {
        "event_id": "evt-sn-1",
        "event_type": "step_viewed",
        "journey_run_id": "run-sn-1",
        "journey": REWARDS,
        "version": "track-1.1a-prototype-2026-09-17",
        "timestamp": "2026-09-19T00:00:00Z",
        "decision_context": "local_demo",
    }
    body.update(overrides)
    if body["journey"] != REWARDS:
        body.pop("card_check_number", None)
    return body


def _valid(**overrides) -> bool:
    try:
        ProductEventRequest(**_body(**overrides))
    except ValidationError:
        return False
    return True


# --- Contract: pure model validation ---------------------------------------


def test_allowlist_is_exactly_the_approved_values() -> None:
    assert SCREEN_NAME_JOURNEY == APPROVED_SCREEN_NAMES
    assert STEP_SCREEN_NAMES == STEP_NAMES
    assert REQUIRED_SCREEN_NAMES_BY_EVENT_TYPE == {
        "result_declared": CHECK_NAMES,
        "connected_example_seen": CONNECTED_NAMES,
        "situation_pilot_interest_submitted": PILOT_NAMES,
    }


@pytest.mark.parametrize("event_type", ["step_viewed", "step_completed"])
@pytest.mark.parametrize("journey", [REWARDS, BORROW])
def test_legacy_step_events_without_screen_name_still_validate(event_type: str, journey: str) -> None:
    assert _valid(event_type=event_type, journey=journey)


@pytest.mark.parametrize("event_type", ["step_viewed", "step_completed"])
@pytest.mark.parametrize("screen_name,journey", sorted(APPROVED_SCREEN_NAMES.items()))
def test_step_events_accept_only_step_screen_names_on_the_matching_journey(
    event_type: str, screen_name: str, journey: str
) -> None:
    assert _valid(event_type=event_type, journey=journey, screen_name=screen_name) is (screen_name in STEP_NAMES)


@pytest.mark.parametrize("screen_name,journey", sorted(APPROVED_SCREEN_NAMES.items()))
def test_result_declared_accepts_only_check_names_on_the_matching_journey(screen_name: str, journey: str) -> None:
    assert _valid(event_type="result_declared", journey=journey, screen_name=screen_name) is (screen_name in CHECK_NAMES)


@pytest.mark.parametrize("screen_name,journey", sorted(APPROVED_SCREEN_NAMES.items()))
def test_connected_example_seen_accepts_only_connected_names_on_the_matching_journey(
    screen_name: str, journey: str
) -> None:
    assert _valid(event_type="connected_example_seen", journey=journey, screen_name=screen_name) is (
        screen_name in CONNECTED_NAMES
    )


@pytest.mark.parametrize("screen_name,journey", sorted(APPROVED_SCREEN_NAMES.items()))
def test_situation_pilot_interest_submitted_accepts_only_pilot_names_on_the_matching_journey(
    screen_name: str, journey: str
) -> None:
    assert _valid(event_type="situation_pilot_interest_submitted", journey=journey, screen_name=screen_name) is (
        screen_name in PILOT_NAMES
    )


@pytest.mark.parametrize("event_type", ["result_declared", "connected_example_seen", "situation_pilot_interest_submitted"])
@pytest.mark.parametrize("journey", [REWARDS, BORROW])
def test_new_event_types_require_screen_name(event_type: str, journey: str) -> None:
    assert not _valid(event_type=event_type, journey=journey)
    assert not _valid(event_type=event_type, journey=journey, screen_name=None)


@pytest.mark.parametrize("screen_name,journey", sorted(APPROVED_SCREEN_NAMES.items()))
def test_cross_journey_combinations_are_rejected(screen_name: str, journey: str) -> None:
    other = BORROW if journey == REWARDS else REWARDS
    if screen_name in STEP_NAMES:
        event_type = "step_viewed"
    elif screen_name in CHECK_NAMES:
        event_type = "result_declared"
    else:
        event_type = "connected_example_seen"
    assert _valid(event_type=event_type, journey=journey, screen_name=screen_name)
    assert not _valid(event_type=event_type, journey=other, screen_name=screen_name)


@pytest.mark.parametrize("screen_name,journey", sorted((n, j) for n, j in APPROVED_SCREEN_NAMES.items() if n in PILOT_NAMES))
def test_situation_pilot_interest_submitted_also_rejects_the_wrong_journey(screen_name: str, journey: str) -> None:
    # test_cross_journey_combinations_are_rejected above always resolves a pilot name to "step_viewed"
    # (pilot names are step names too), so it never actually exercises this event type's own cross-journey
    # check — this closes that gap directly.
    other = BORROW if journey == REWARDS else REWARDS
    assert _valid(event_type="situation_pilot_interest_submitted", journey=journey, screen_name=screen_name)
    assert not _valid(event_type="situation_pilot_interest_submitted", journey=other, screen_name=screen_name)


def test_every_other_event_type_rejects_a_supplied_screen_name() -> None:
    from typing import get_args

    from app.models.product_event import ProductEventType

    exempt = {"step_viewed", "step_completed", "result_declared", "connected_example_seen", "situation_pilot_interest_submitted"}
    others = [event_type for event_type in get_args(ProductEventType) if event_type not in exempt]
    assert len(others) > 30
    for event_type in others:
        for screen_name, journey in APPROVED_SCREEN_NAMES.items():
            assert not _valid(event_type=event_type, journey=journey, screen_name=screen_name), (event_type, screen_name)


def test_event_type_vocabulary_gains_exactly_the_two_approved_types_and_keeps_history() -> None:
    from typing import get_args

    from app.models.product_event import ProductEventType, STEP6_EVENT_TYPES

    types = set(get_args(ProductEventType))
    assert {"result_declared", "connected_example_seen"} <= types
    # Historical vocabulary stays accepted for compatibility.
    assert {"step_viewed", "step_completed", "otp_requested", "pilot_consent_recorded", "journey_started"} <= types
    # Phase 1.1B (this PR): exactly the five Step 6 funnel events authorized by
    # docs/product/journeys/JOURNEY_FLOW_SPEC.md, no more and no fewer.
    assert STEP6_EVENT_TYPES == {"pilot_interest_clicked", "mobile_submitted", "otp_sent", "otp_verified", "optional_updates_opted_in"}
    assert STEP6_EVENT_TYPES <= types


@pytest.mark.parametrize(
    "value",
    [
        "",
        " ",
        "rewards_check ",
        "REWARDS_CHECK",
        "rewards-check",
        "unknown_screen",
        "₹1,20,000",
        "14%",
        "+91 98765 43210",
        "123456",
        "a@b.com",
        "monthly income is 50000",
        "rewards_check; DROP TABLE product_events",
        "x" * 500,
        123,
        True,
        ["rewards_check"],
        {"rewards_check": 1},
    ],
)
def test_screen_name_rejects_arbitrary_or_sensitive_values(value) -> None:
    for event_type in ("step_viewed", "result_declared", "connected_example_seen", "situation_pilot_interest_submitted"):
        assert not _valid(event_type=event_type, screen_name=value)


# --- Contract: HTTP + persistence ------------------------------------------


def _bootstrap(client):
    response = client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    return {get_cookie_name(): response.cookies.get(get_cookie_name())}


def _post(client, cookies, **overrides):
    return client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookies, json=_body(**overrides))


def _stored(database_url: str, event_id: str | None = None):
    engine = create_engine(database_url, future=True)
    try:
        with engine.connect() as conn:
            query = "SELECT event_id, event_type, screen_name FROM product_events"
            if event_id:
                return conn.execute(text(query + " WHERE event_id = :e"), {"e": event_id}).mappings().all()
            return conn.execute(text(query + " ORDER BY event_id")).mappings().all()
    finally:
        engine.dispose()


def test_legacy_step_events_persist_with_null_screen_name(phaseb_client, phaseb_upgraded_database: str) -> None:
    cookies = _bootstrap(phaseb_client)
    for event_type in ("step_viewed", "step_completed"):
        response = _post(phaseb_client, cookies, event_id=f"legacy-{event_type}", event_type=event_type)
        assert response.status_code == 200
        assert response.json()["screen_name"] is None
        assert _stored(phaseb_upgraded_database, f"legacy-{event_type}")[0]["screen_name"] is None


def test_every_approved_event_screen_pairing_persists_and_is_returned(
    phaseb_client, phaseb_upgraded_database: str
) -> None:
    cookies = _bootstrap(phaseb_client)
    expected = {}
    for screen_name, journey in APPROVED_SCREEN_NAMES.items():
        if screen_name in STEP_NAMES:
            event_types = ["step_viewed", "step_completed"]
        elif screen_name in CHECK_NAMES:
            event_types = ["result_declared"]
        else:
            event_types = ["connected_example_seen"]
        if screen_name in PILOT_NAMES:
            # A pilot screen name is both a step name (its own appearance) and this event type's required
            # role (its submission) — see PILOT_NAMES' docstring above.
            event_types = event_types + ["situation_pilot_interest_submitted"]
        for event_type in event_types:
            event_id = f"ok-{event_type}-{screen_name}"
            response = _post(
                phaseb_client,
                cookies,
                event_id=event_id,
                journey_run_id=f"run-{journey}",
                event_type=event_type,
                journey=journey,
                screen_name=screen_name,
            )
            assert response.status_code == 200, response.text
            assert response.json()["screen_name"] == screen_name
            expected[event_id] = screen_name

    stored = {row["event_id"]: row["screen_name"] for row in _stored(phaseb_upgraded_database)}
    assert stored == expected


def test_invalid_combinations_return_422_and_persist_nothing(phaseb_client, phaseb_upgraded_database: str) -> None:
    cookies = _bootstrap(phaseb_client)
    invalid = [
        dict(event_type="step_viewed", screen_name="unknown_screen"),
        dict(event_type="step_viewed", journey=BORROW, screen_name="rewards_card_behaviour"),
        dict(event_type="step_completed", journey=REWARDS, screen_name="borrow_plan"),
        dict(event_type="step_viewed", screen_name="rewards_check"),
        dict(event_type="result_declared"),
        dict(event_type="result_declared", screen_name="rewards_card_behaviour"),
        dict(event_type="result_declared", journey=BORROW, screen_name="rewards_check"),
        dict(event_type="connected_example_seen"),
        dict(event_type="connected_example_seen", screen_name="rewards_check"),
        dict(event_type="connected_example_seen", journey=REWARDS, screen_name="borrow_connected_example"),
        dict(event_type="door_selected", screen_name="rewards_card_behaviour"),
        dict(event_type="step_viewed", screen_name="₹10,800 cashback"),
    ]
    for index, overrides in enumerate(invalid):
        response = _post(phaseb_client, cookies, event_id=f"bad-{index}", **overrides)
        assert response.status_code == 422, overrides
    assert _stored(phaseb_upgraded_database) == []


def test_duplicate_retry_preserves_stored_screen_name_and_session_scoped_idempotency(
    phaseb_client, phaseb_upgraded_database: str
) -> None:
    cookies = _bootstrap(phaseb_client)
    kwargs = dict(event_id="dup-1", event_type="result_declared", screen_name="rewards_check")
    first = _post(phaseb_client, cookies, **kwargs)
    retry = _post(phaseb_client, cookies, **kwargs)
    # Same event_id replayed with a different (valid) screen_name keeps the stored value.
    conflicting = _post(
        phaseb_client, cookies, event_id="dup-1", event_type="connected_example_seen", screen_name="rewards_connected_example"
    )
    assert (first.status_code, retry.status_code, conflicting.status_code) == (200, 200, 200)
    assert retry.json()["screen_name"] == "rewards_check"
    assert conflicting.json()["screen_name"] == "rewards_check"

    rows = _stored(phaseb_upgraded_database, "dup-1")
    assert len(rows) == 1
    assert rows[0]["screen_name"] == "rewards_check"

    # A different session may reuse the same event_id: idempotency stays session-scoped.
    other_cookies = {
        get_cookie_name(): phaseb_client.post(
            "/v1/anonymous-sessions/bootstrap",
            headers={"Origin": phaseb_origin()},
            cookies={get_cookie_name(): "invalid-token"},
        ).cookies.get(get_cookie_name())
    }
    other = _post(phaseb_client, other_cookies, event_id="dup-1", event_type="connected_example_seen", screen_name="rewards_connected_example")
    assert other.status_code == 200
    assert other.json()["screen_name"] == "rewards_connected_example"
    assert len(_stored(phaseb_upgraded_database, "dup-1")) == 2


def test_insert_failure_keeps_202_semantics_and_leaks_no_details(monkeypatch, phaseb_client, caplog) -> None:
    cookies = _bootstrap(phaseb_client)

    def fail_insert(*args, **kwargs):
        raise SQLAlchemyError("raw sql message")

    monkeypatch.setattr("app.services.product_events.insert_product_event", fail_insert)
    with caplog.at_level(logging.DEBUG):
        response = _post(phaseb_client, cookies, event_type="result_declared", screen_name="rewards_check")
    assert response.status_code == 202
    body = response.json()
    assert body["status"] == "accepted_not_persisted"
    assert body["screen_name"] == "rewards_check"
    assert "raw sql message" not in response.text
    # The categorical value is never written to logs.
    assert "rewards_check" not in caplog.text


def test_database_rejects_unapproved_screen_name_even_if_application_validation_is_bypassed(
    phaseb_upgraded_database: str,
) -> None:
    engine = create_engine(phaseb_upgraded_database, future=True)
    try:
        with engine.begin() as conn:
            session_uuid = conn.execute(
                text(
                    "INSERT INTO anonymous_sessions (absolute_expires_at) VALUES (now() + interval '1 day') "
                    "RETURNING anonymous_session_uuid"
                )
            ).scalar_one()
            run_uuid = conn.execute(
                text(
                    "INSERT INTO journey_runs (anonymous_session_uuid, client_journey_run_id, journey, version) "
                    "VALUES (:s, 'r', 'money_value', 'v') RETURNING journey_run_uuid"
                ),
                {"s": session_uuid},
            ).scalar_one()
        with pytest.raises(SQLAlchemyError):
            with engine.begin() as conn:
                conn.execute(
                    text(
                        "INSERT INTO product_events (anonymous_session_uuid, journey_run_uuid, event_id, event_type, journey, "
                        "version, client_occurred_at, effective_occurred_at, client_clock_skew_status, screen_name) "
                        "VALUES (:s, :r, 'x', 'step_viewed', 'money_value', 'v', now(), now(), 'trusted', 'income_50000')"
                    ),
                    {"s": session_uuid, "r": run_uuid},
                )
    finally:
        engine.dispose()
