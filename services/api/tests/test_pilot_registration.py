from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from conftest import phaseb_origin


def _enable_track11b(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.routers.pilot.track11b_enabled", lambda: True)


def _configure_dev_sms(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PILOT_SMS_PROVIDER", "logging-dev-only")


def _fix_generated_code(monkeypatch: pytest.MonkeyPatch, code: str) -> None:
    monkeypatch.setattr("app.services.pilot._generate_code", lambda length: code)


def _register_interest(client: TestClient, journey: str = "money_value") -> str:
    response = client.post("/v1/pilot/interest", json={"journey": journey})
    assert response.status_code == 200
    return response.json()["pilot_registration_id"]


# --- Flag gating -----------------------------------------------------------------------------


def test_all_pilot_routes_404_when_track11b_is_disabled(phaseb_client: TestClient) -> None:
    # track11b_enabled() is not patched here: this exercises the real, committed-false default.
    assert phaseb_client.post("/v1/pilot/interest", json={"journey": "money_value"}).status_code == 404
    assert phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": "x", "phone_number": "+919876543210"}).status_code == 404
    assert phaseb_client.post("/v1/pilot/mobile/resend", json={"pilot_registration_id": "x"}).status_code == 404
    assert phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": "x", "code": "123456"}, headers={"Origin": phaseb_origin()}).status_code == 404


# --- Step 6A: interest click only -------------------------------------------------------------


def test_interest_click_collects_no_phone_otp_identity_or_permission_field(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    # The schema itself (extra="forbid") rejects any field beyond journey/journey_run_id — this proves it,
    # rather than just trusting the model definition.
    response = phaseb_client.post("/v1/pilot/interest", json={"journey": "money_value", "phone_number": "+919876543210"})
    assert response.status_code == 422


def test_interest_click_creates_an_unlinked_unverified_registration(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str) -> None:
    _enable_track11b(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client, "comfortable_borrowing")

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT journey, status, phone_number, anonymous_session_uuid, optional_updates_opted_in FROM pilot_registrations WHERE pilot_registration_uuid = :id"),
            {"id": pilot_registration_id},
        ).mappings().one()
    assert row["journey"] == "comfortable_borrowing"
    assert row["status"] == "interest_clicked"
    assert row["phone_number"] is None
    assert row["anonymous_session_uuid"] is None
    assert row["optional_updates_opted_in"] is False


# --- SMS provider: must fail closed, never fake success ---------------------------------------


def test_mobile_submit_fails_closed_when_no_sms_provider_is_configured(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    # PILOT_SMS_PROVIDER is deliberately left unset.
    pilot_registration_id = _register_interest(phaseb_client)
    response = phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})
    assert response.status_code == 503
    assert response.json()["detail"] == "sms_provider_not_configured"


def test_mobile_submit_rejects_a_non_e164_phone_number(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client)
    response = phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "9876543210"})
    assert response.status_code == 422


# --- Step 6B: mobile + OTP, consent separation -------------------------------------------------


def test_mobile_submit_records_phone_and_keeps_optional_updates_separate_and_unchecked_by_default(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client)

    response = phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "otp_sent"
    assert body["resend_after_seconds"] >= 10

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT status, phone_number, optional_updates_opted_in, anonymous_session_uuid FROM pilot_registrations WHERE pilot_registration_uuid = :id"),
            {"id": pilot_registration_id},
        ).mappings().one()
    # The OTP send that follows the phone-number save moves status on to "otp_sent" within the same call.
    assert row["status"] == "otp_sent"
    assert row["phone_number"] == "+919876543210"
    # Not opted in above, so it must default false — a customer's silence is never treated as consent.
    assert row["optional_updates_opted_in"] is False
    # Linking must never happen at this stage, only after successful verification.
    assert row["anonymous_session_uuid"] is None


def test_optional_updates_choice_is_recorded_only_when_explicitly_true(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client)
    phaseb_client.post(
        "/v1/pilot/mobile",
        json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210", "optional_updates_opted_in": True},
    )
    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        opted_in = conn.execute(
            text("SELECT optional_updates_opted_in FROM pilot_registrations WHERE pilot_registration_uuid = :id"), {"id": pilot_registration_id}
        ).scalar_one()
    assert opted_in is True


# --- OTP verification: correctness, expiry, attempt limits, resend --------------------------


def test_correct_code_verifies_and_links_the_anonymous_session_only_now(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _fix_generated_code(monkeypatch, "482913")

    bootstrap = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    assert bootstrap.status_code == 200

    pilot_registration_id = _register_interest(phaseb_client)
    phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})

    response = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "482913"}, headers={"Origin": phaseb_origin()})
    assert response.status_code == 200
    assert response.json()["status"] == "verified"

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT status, phone_verified_at, anonymous_session_uuid FROM pilot_registrations WHERE pilot_registration_uuid = :id"),
            {"id": pilot_registration_id},
        ).mappings().one()
    assert row["status"] == "verified"
    assert row["phone_verified_at"] is not None
    # Linked because a valid anonymous session cookie was actually presented at verify time.
    assert row["anonymous_session_uuid"] is not None


def test_verification_without_a_session_cookie_still_verifies_but_links_nothing(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _fix_generated_code(monkeypatch, "111222")
    pilot_registration_id = _register_interest(phaseb_client)
    phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})

    # No anonymous-session bootstrap call was made, so no cookie is presented here.
    response = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "111222"}, headers={"Origin": phaseb_origin()})
    assert response.status_code == 200

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT status, phone_verified_at, anonymous_session_uuid FROM pilot_registrations WHERE pilot_registration_uuid = :id"),
            {"id": pilot_registration_id},
        ).mappings().one()
    assert row["status"] == "verified"
    assert row["phone_verified_at"] is not None
    assert row["anonymous_session_uuid"] is None


def test_wrong_code_is_rejected_and_counted_as_an_attempt(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _fix_generated_code(monkeypatch, "999999")
    pilot_registration_id = _register_interest(phaseb_client)
    phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})

    response = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "000000"}, headers={"Origin": phaseb_origin()})
    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_code"


def test_too_many_wrong_attempts_locks_the_code_out(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _fix_generated_code(monkeypatch, "555555")
    monkeypatch.setenv("PILOT_OTP_MAX_ATTEMPTS", "3")
    pilot_registration_id = _register_interest(phaseb_client)
    phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})

    for _ in range(3):
        response = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "000000"}, headers={"Origin": phaseb_origin()})
        assert response.status_code == 401

    locked = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "555555"}, headers={"Origin": phaseb_origin()})
    assert locked.status_code == 429
    assert locked.json()["detail"] == "too_many_attempts"


def test_expired_code_is_rejected_even_if_correct(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _fix_generated_code(monkeypatch, "246810")
    pilot_registration_id = _register_interest(phaseb_client)
    phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})

    # Force the stored challenge into the past rather than sleeping past a real TTL. expires_at must stay
    # after created_at (ck_otp_challenges_expires_after_create), so anchor to the row's own created_at
    # rather than "now" — by the time verify() runs a moment later, this is still safely expired.
    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.begin() as conn:
        created_at = conn.execute(
            text("SELECT created_at FROM otp_challenges WHERE pilot_registration_uuid = :id"), {"id": pilot_registration_id}
        ).scalar_one()
        conn.execute(
            text("UPDATE otp_challenges SET expires_at = :expires_at WHERE pilot_registration_uuid = :id"),
            {"expires_at": created_at + timedelta(milliseconds=1), "id": pilot_registration_id},
        )

    response = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "246810"}, headers={"Origin": phaseb_origin()})
    assert response.status_code == 410
    assert response.json()["detail"] == "code_expired"


def test_resend_too_soon_is_rejected_and_a_later_resend_works_with_a_fresh_code(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _fix_generated_code(monkeypatch, "111111")
    pilot_registration_id = _register_interest(phaseb_client)
    phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})

    immediate = phaseb_client.post("/v1/pilot/mobile/resend", json={"pilot_registration_id": pilot_registration_id})
    assert immediate.status_code == 429
    assert immediate.json()["detail"] == "resend_too_soon"

    # Simulate the cooldown having elapsed, then resend with a new fixed code.
    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE otp_challenges SET last_sent_at = :past WHERE pilot_registration_uuid = :id"),
            {"past": datetime.now(UTC) - timedelta(minutes=5), "id": pilot_registration_id},
        )
    _fix_generated_code(monkeypatch, "222222")
    resent = phaseb_client.post("/v1/pilot/mobile/resend", json={"pilot_registration_id": pilot_registration_id})
    assert resent.status_code == 200

    # The old code no longer works; the new one does.
    old_code_attempt = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "111111"}, headers={"Origin": phaseb_origin()})
    assert old_code_attempt.status_code == 401
    new_code_attempt = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "222222"}, headers={"Origin": phaseb_origin()})
    assert new_code_attempt.status_code == 200


def test_verifying_an_already_verified_registration_is_rejected(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _fix_generated_code(monkeypatch, "333444")
    pilot_registration_id = _register_interest(phaseb_client)
    phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": pilot_registration_id, "phone_number": "+919876543210"})
    first = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "333444"}, headers={"Origin": phaseb_origin()})
    assert first.status_code == 200

    second = phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": "333444"}, headers={"Origin": phaseb_origin()})
    assert second.status_code == 409
    assert second.json()["detail"] == "already_verified"


# --- Event payload cleanliness (via the existing shared /v1/events pipeline) ------------------


def test_step6_events_are_accepted_with_only_journey_run_id_and_journey_no_other_field(phaseb_client: TestClient) -> None:
    bootstrap = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    cookie = bootstrap.cookies

    for event_type in ("pilot_interest_clicked", "mobile_submitted", "otp_sent", "otp_verified", "optional_updates_opted_in"):
        response = phaseb_client.post(
            "/v1/events",
            headers={"Origin": phaseb_origin()},
            cookies=cookie,
            json={
                "event_id": f"evt-{event_type}",
                "event_type": event_type,
                "journey_run_id": "run-1",
                "journey": "money_value",
                "version": "test",
                "timestamp": datetime.now(UTC).isoformat(),
            },
        )
        assert response.status_code == 200, (event_type, response.text)


def test_step6_events_reject_a_screen_name_or_intent_or_reason(phaseb_client: TestClient) -> None:
    bootstrap = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    cookie = bootstrap.cookies
    base = {
        "event_id": "evt-1",
        "event_type": "pilot_interest_clicked",
        "journey_run_id": "run-1",
        "journey": "money_value",
        "version": "test",
        "timestamp": datetime.now(UTC).isoformat(),
    }
    for extra in ({"screen_name": "rewards_check"}, {"intent": "actual_card_value"}, {"reason": "other"}):
        response = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookie, json={**base, **extra})
        assert response.status_code == 422, extra
