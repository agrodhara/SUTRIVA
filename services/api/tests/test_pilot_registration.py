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


def _configure_otp_keys(monkeypatch: pytest.MonkeyPatch, keys: str = "test-current-key,test-previous-key") -> None:
    monkeypatch.setenv("PILOT_OTP_HMAC_KEYS", keys)


def _fix_generated_code(monkeypatch: pytest.MonkeyPatch, code: str) -> None:
    monkeypatch.setattr("app.services.pilot._generate_code", lambda length: code)


@pytest.fixture(autouse=True)
def _reset_pilot_rate_limiters():
    # Every call in this file goes through the same TestClient, which Starlette gives a fixed client host
    # ("testclient") — so without a reset, per-IP limiter state would leak between unrelated tests and
    # spuriously trip the limiter for tests that never intended to exercise it.
    from app.routers.pilot import _interest_limiter, _mobile_limiter, _verify_limiter

    _interest_limiter.reset()
    _mobile_limiter.reset()
    _verify_limiter.reset()
    yield


def _register_interest(client: TestClient, journey: str = "money_value") -> str:
    response = client.post("/v1/pilot/interest", json={"journey": journey}, headers={"Origin": phaseb_origin()})
    assert response.status_code == 200, response.text
    return response.json()["pilot_registration_id"]


def _submit_mobile(client: TestClient, pilot_registration_id: str, phone_number: str = "+919876543210", **extra):
    return client.post(
        "/v1/pilot/mobile",
        json={"pilot_registration_id": pilot_registration_id, "phone_number": phone_number, **extra},
        headers={"Origin": phaseb_origin()},
    )


def _resend(client: TestClient, pilot_registration_id: str):
    return client.post("/v1/pilot/mobile/resend", json={"pilot_registration_id": pilot_registration_id}, headers={"Origin": phaseb_origin()})


def _verify(client: TestClient, pilot_registration_id: str, code: str):
    return client.post("/v1/pilot/verify", json={"pilot_registration_id": pilot_registration_id, "code": code}, headers={"Origin": phaseb_origin()})


def _push_last_sent_into_the_past(engine, pilot_registration_id: str, *, minutes: int = 5) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE otp_challenges SET last_sent_at = :past WHERE pilot_registration_uuid = :id"),
            {"past": datetime.now(UTC) - timedelta(minutes=minutes), "id": pilot_registration_id},
        )


# --- Flag gating -----------------------------------------------------------------------------


def test_all_pilot_routes_404_when_track11b_is_disabled(phaseb_client: TestClient) -> None:
    # track11b_enabled() is not patched here: this exercises the real, committed-false default.
    origin = {"Origin": phaseb_origin()}
    assert phaseb_client.post("/v1/pilot/interest", json={"journey": "money_value"}, headers=origin).status_code == 404
    assert phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": "x", "phone_number": "+919876543210"}, headers=origin).status_code == 404
    assert phaseb_client.post("/v1/pilot/mobile/resend", json={"pilot_registration_id": "x"}, headers=origin).status_code == 404
    assert phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": "x", "code": "123456"}, headers=origin).status_code == 404


# --- Origin protection: every pilot endpoint, not just /verify --------------------------------


def test_every_pilot_endpoint_rejects_a_missing_or_wrong_origin(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)

    # No Origin header at all.
    assert phaseb_client.post("/v1/pilot/interest", json={"journey": "money_value"}).status_code == 403
    assert phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": "x", "phone_number": "+919876543210"}).status_code == 403
    assert phaseb_client.post("/v1/pilot/mobile/resend", json={"pilot_registration_id": "x"}).status_code == 403
    assert phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": "x", "code": "123456"}).status_code == 403

    # A wrong Origin.
    wrong = {"Origin": "https://not-sutriva.example"}
    assert phaseb_client.post("/v1/pilot/interest", json={"journey": "money_value"}, headers=wrong).status_code == 403
    assert phaseb_client.post("/v1/pilot/mobile", json={"pilot_registration_id": "x", "phone_number": "+919876543210"}, headers=wrong).status_code == 403
    assert phaseb_client.post("/v1/pilot/mobile/resend", json={"pilot_registration_id": "x"}, headers=wrong).status_code == 403
    assert phaseb_client.post("/v1/pilot/verify", json={"pilot_registration_id": "x", "code": "123456"}, headers=wrong).status_code == 403


# --- Step 6A: interest click only -------------------------------------------------------------


def test_interest_click_collects_no_phone_otp_identity_or_permission_field(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    # The schema itself (extra="forbid") rejects any field beyond journey/journey_run_id — this proves it,
    # rather than just trusting the model definition.
    response = phaseb_client.post(
        "/v1/pilot/interest", json={"journey": "money_value", "phone_number": "+919876543210"}, headers={"Origin": phaseb_origin()}
    )
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


def test_journey_run_id_is_accepted_but_never_linked_in_phase_1_1b(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str) -> None:
    _enable_track11b(monkeypatch)
    response = phaseb_client.post(
        "/v1/pilot/interest", json={"journey": "money_value", "journey_run_id": "client-run-abc"}, headers={"Origin": phaseb_origin()}
    )
    assert response.status_code == 200
    pilot_registration_id = response.json()["pilot_registration_id"]

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        journey_run_uuid = conn.execute(
            text("SELECT journey_run_uuid FROM pilot_registrations WHERE pilot_registration_uuid = :id"), {"id": pilot_registration_id}
        ).scalar_one()
    # Documented, deliberate gap (see app/services/pilot.py's register_interest docstring): a client-
    # supplied journey_run_id is accepted but never resolved into a real journey_runs row in Phase 1.1B.
    assert journey_run_uuid is None


# --- SMS provider: must fail closed, never fake success ---------------------------------------


def test_mobile_submit_fails_closed_when_no_sms_provider_is_configured(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_otp_keys(monkeypatch)
    # PILOT_SMS_PROVIDER is deliberately left unset.
    pilot_registration_id = _register_interest(phaseb_client)
    response = _submit_mobile(phaseb_client, pilot_registration_id)
    assert response.status_code == 503
    assert response.json()["detail"] == "sms_provider_not_configured"


def test_mobile_submit_fails_closed_when_no_otp_hmac_key_is_configured(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    # PILOT_OTP_HMAC_KEYS is deliberately left unset: a code must never be hashed with no keyed secret.
    pilot_registration_id = _register_interest(phaseb_client)
    response = _submit_mobile(phaseb_client, pilot_registration_id)
    assert response.status_code == 503
    assert response.json()["detail"] == "otp_signing_key_not_configured"


def test_mobile_submit_rejects_a_non_e164_phone_number(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client)
    response = _submit_mobile(phaseb_client, pilot_registration_id, phone_number="9876543210")
    assert response.status_code == 422


def test_a_rejected_sms_send_never_produces_otp_sent_or_a_success_response(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str) -> None:
    _enable_track11b(monkeypatch)
    _configure_otp_keys(monkeypatch)

    from app.services.sms import SmsSendResult

    class RejectingSmsSender:
        def send(self, *, phone_number: str, code: str) -> SmsSendResult:
            return SmsSendResult(provider="test-rejecting", accepted=False)

    monkeypatch.setattr("app.services.pilot.get_sms_sender", lambda settings: RejectingSmsSender())

    pilot_registration_id = _register_interest(phaseb_client)
    response = _submit_mobile(phaseb_client, pilot_registration_id)
    assert response.status_code == 503
    assert response.json()["detail"] == "sms_send_failed"

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT status FROM pilot_registrations WHERE pilot_registration_uuid = :id"), {"id": pilot_registration_id}
        ).mappings().one()
        challenge_count = conn.execute(
            text("SELECT count(*) FROM otp_challenges WHERE pilot_registration_uuid = :id"), {"id": pilot_registration_id}
        ).scalar_one()
    # The whole attempt rolled back: no otp_sent status, and no leftover challenge row for a code that was
    # never actually sent.
    assert row["status"] == "interest_clicked"
    assert challenge_count == 0


def test_a_rejected_resend_also_leaves_the_previous_code_valid(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "121212")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    engine = create_engine(phaseb_upgraded_database, future=True)
    _push_last_sent_into_the_past(engine, pilot_registration_id)

    from app.services.sms import SmsSendResult

    class RejectingSmsSender:
        def send(self, *, phone_number: str, code: str) -> SmsSendResult:
            return SmsSendResult(provider="test-rejecting", accepted=False)

    monkeypatch.setattr("app.services.pilot.get_sms_sender", lambda settings: RejectingSmsSender())

    resend_response = _resend(phaseb_client, pilot_registration_id)
    assert resend_response.status_code == 503
    assert resend_response.json()["detail"] == "sms_send_failed"

    # The original code, sent before the rejected resend attempt, still verifies.
    verify_response = _verify(phaseb_client, pilot_registration_id, "121212")
    assert verify_response.status_code == 200


# --- Step 6B: mobile + OTP, consent separation -------------------------------------------------


def test_mobile_submit_records_phone_and_keeps_optional_updates_separate_and_unchecked_by_default(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client)

    response = _submit_mobile(phaseb_client, pilot_registration_id)
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
    _configure_otp_keys(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id, optional_updates_opted_in=True)
    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        opted_in = conn.execute(
            text("SELECT optional_updates_opted_in FROM pilot_registrations WHERE pilot_registration_uuid = :id"), {"id": pilot_registration_id}
        ).scalar_one()
    assert opted_in is True


def test_optional_updates_opted_in_true_on_an_unverified_registration_is_not_a_verified_marketing_consent(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    """The checkbox records an *intent* at Step 6B, before the phone is proven to belong to the person
    submitting it. Anything that reads this column as an actionable marketing opt-in must also check
    phone_verified_at — this test locks in that an opted-in-but-unverified row is distinguishable from a
    verified one, which is what makes that check possible."""
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id, optional_updates_opted_in=True)

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        row = conn.execute(
            text("SELECT optional_updates_opted_in, phone_verified_at FROM pilot_registrations WHERE pilot_registration_uuid = :id"),
            {"id": pilot_registration_id},
        ).mappings().one()
    assert row["optional_updates_opted_in"] is True
    assert row["phone_verified_at"] is None


# --- OTP verification: correctness, expiry, attempt limits, resend --------------------------


def test_correct_code_verifies_and_links_the_anonymous_session_only_now(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "482913")

    bootstrap = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    assert bootstrap.status_code == 200

    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    response = _verify(phaseb_client, pilot_registration_id, "482913")
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
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "111222")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    # No anonymous-session bootstrap call was made, so no cookie is presented here.
    response = _verify(phaseb_client, pilot_registration_id, "111222")
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
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "999999")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    response = _verify(phaseb_client, pilot_registration_id, "000000")
    assert response.status_code == 401
    assert response.json()["detail"] == "invalid_code"


def test_too_many_wrong_attempts_locks_the_code_out(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "555555")
    monkeypatch.setenv("PILOT_OTP_MAX_ATTEMPTS", "3")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    for _ in range(3):
        response = _verify(phaseb_client, pilot_registration_id, "000000")
        assert response.status_code == 401

    locked = _verify(phaseb_client, pilot_registration_id, "555555")
    assert locked.status_code == 429
    assert locked.json()["detail"] == "too_many_attempts"


def test_a_resend_does_not_reset_the_attempt_count_so_it_cannot_grant_unlimited_fresh_guesses(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    monkeypatch.setenv("PILOT_OTP_MAX_ATTEMPTS", "3")
    _fix_generated_code(monkeypatch, "111111")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    # Two wrong guesses against the first code.
    for _ in range(2):
        assert _verify(phaseb_client, pilot_registration_id, "000000").status_code == 401

    engine = create_engine(phaseb_upgraded_database, future=True)
    _push_last_sent_into_the_past(engine, pilot_registration_id)
    _fix_generated_code(monkeypatch, "222222")
    resent = _resend(phaseb_client, pilot_registration_id)
    assert resent.status_code == 200

    # Only one guess remains (3 max - 2 already used), not a fresh budget of 3 against the new code.
    assert _verify(phaseb_client, pilot_registration_id, "000000").status_code == 401
    locked = _verify(phaseb_client, pilot_registration_id, "222222")
    assert locked.status_code == 429
    assert locked.json()["detail"] == "too_many_attempts"


def test_expired_code_is_rejected_even_if_correct(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "246810")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

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

    response = _verify(phaseb_client, pilot_registration_id, "246810")
    assert response.status_code == 410
    assert response.json()["detail"] == "code_expired"


def test_resend_too_soon_is_rejected_and_a_later_resend_works_with_a_fresh_code(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "111111")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    immediate = _resend(phaseb_client, pilot_registration_id)
    assert immediate.status_code == 429
    assert immediate.json()["detail"] == "resend_too_soon"

    # Simulate the cooldown having elapsed, then resend with a new fixed code.
    engine = create_engine(phaseb_upgraded_database, future=True)
    _push_last_sent_into_the_past(engine, pilot_registration_id)
    _fix_generated_code(monkeypatch, "222222")
    resent = _resend(phaseb_client, pilot_registration_id)
    assert resent.status_code == 200

    # The old code no longer works; the new one does.
    old_code_attempt = _verify(phaseb_client, pilot_registration_id, "111111")
    assert old_code_attempt.status_code == 401
    new_code_attempt = _verify(phaseb_client, pilot_registration_id, "222222")
    assert new_code_attempt.status_code == 200


def test_verifying_an_already_verified_registration_is_rejected(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "333444")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)
    first = _verify(phaseb_client, pilot_registration_id, "333444")
    assert first.status_code == 200

    second = _verify(phaseb_client, pilot_registration_id, "333444")
    assert second.status_code == 409
    assert second.json()["detail"] == "already_verified"


def test_otp_key_rotation_lets_an_old_key_still_verify_a_code_it_signed(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # The code is generated and hashed while only the "old-key" is configured...
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch, "old-key")
    _fix_generated_code(monkeypatch, "654321")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    # ...then the key is rotated: a new key is prepended, but the old key stays in the list.
    _configure_otp_keys(monkeypatch, "new-key,old-key")
    response = _verify(phaseb_client, pilot_registration_id, "654321")
    assert response.status_code == 200


def test_otp_key_rotation_drops_verification_once_the_old_key_is_fully_retired(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch, "old-key")
    _fix_generated_code(monkeypatch, "111000")
    pilot_registration_id = _register_interest(phaseb_client)
    _submit_mobile(phaseb_client, pilot_registration_id)

    # The old key is retired entirely (not kept during a rotation window) — a code it signed no longer
    # verifies. This is expected: an operator must keep a retiring key configured until every code hashed
    # under it has expired (see PilotOtpSettings.hmac_keys's docstring).
    _configure_otp_keys(monkeypatch, "new-key")
    response = _verify(phaseb_client, pilot_registration_id, "111000")
    assert response.status_code == 401


# --- Abuse controls: bounding sends and attempts ------------------------------------------------


def test_per_registration_send_cap_cannot_be_bypassed_by_changing_the_number_repeatedly(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    monkeypatch.setenv("PILOT_OTP_MAX_SENDS_PER_REGISTRATION", "2")
    pilot_registration_id = _register_interest(phaseb_client)

    # Send 1: the initial mobile submit.
    first = _submit_mobile(phaseb_client, pilot_registration_id, phone_number="+919000000001")
    assert first.status_code == 200
    # Send 2: "Change number" to a different number — not resend-cooldown-limited, but still a send.
    second = _submit_mobile(phaseb_client, pilot_registration_id, phone_number="+919000000002")
    assert second.status_code == 200
    # Send 3: capped at the per-registration limit, regardless of the number being different again.
    third = _submit_mobile(phaseb_client, pilot_registration_id, phone_number="+919000000003")
    assert third.status_code == 429
    assert third.json()["detail"] == "resend_limit_reached"


def test_per_phone_send_cap_cannot_be_bypassed_by_starting_a_new_registration(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    monkeypatch.setenv("PILOT_OTP_MAX_SENDS_PER_PHONE", "2")
    same_phone = "+919111111111"

    # Two different registrations, each sending once to the SAME phone number.
    reg_a = _register_interest(phaseb_client)
    assert _submit_mobile(phaseb_client, reg_a, phone_number=same_phone).status_code == 200
    reg_b = _register_interest(phaseb_client)
    assert _submit_mobile(phaseb_client, reg_b, phone_number=same_phone).status_code == 200

    # A third, brand-new registration sending to the same phone number is still capped: a fresh
    # registration's own (empty) per-registration budget does not reset the phone's shared budget.
    reg_c = _register_interest(phaseb_client)
    third = _submit_mobile(phaseb_client, reg_c, phone_number=same_phone)
    assert third.status_code == 429
    assert third.json()["detail"] == "phone_send_limit_reached"


def test_resubmitting_the_same_number_without_waiting_is_treated_as_a_resend_and_cooldown_limited(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Covers the frontend's "Back" then resubmit path: going back to the mobile screen and submitting the
    *same* number again must not be a free way around the resend cooldown."""
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    pilot_registration_id = _register_interest(phaseb_client)
    assert _submit_mobile(phaseb_client, pilot_registration_id, phone_number="+919876543210").status_code == 200

    resubmit_same_number = _submit_mobile(phaseb_client, pilot_registration_id, phone_number="+919876543210")
    assert resubmit_same_number.status_code == 429
    assert resubmit_same_number.json()["detail"] == "resend_too_soon"


def test_per_ip_rate_limit_on_interest_cannot_be_bypassed_by_registering_repeatedly(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    monkeypatch.setenv("PILOT_RATE_LIMIT_INTEREST_PER_IP_PER_HOUR", "2")
    assert _register_interest(phaseb_client)
    assert _register_interest(phaseb_client)
    third = phaseb_client.post("/v1/pilot/interest", json={"journey": "money_value"}, headers={"Origin": phaseb_origin()})
    assert third.status_code == 429
    assert third.json()["detail"] == "rate_limited"


def test_per_ip_rate_limit_on_mobile_applies_across_different_registrations(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    monkeypatch.setenv("PILOT_RATE_LIMIT_MOBILE_PER_IP_PER_HOUR", "2")

    reg_a = _register_interest(phaseb_client)
    assert _submit_mobile(phaseb_client, reg_a, phone_number="+919222222221").status_code == 200
    reg_b = _register_interest(phaseb_client)
    assert _submit_mobile(phaseb_client, reg_b, phone_number="+919222222222").status_code == 200
    # A third distinct registration and a third distinct phone number — the per-IP budget, not the
    # per-registration or per-phone one, is what stops this.
    reg_c = _register_interest(phaseb_client)
    third = _submit_mobile(phaseb_client, reg_c, phone_number="+919222222223")
    assert third.status_code == 429
    assert third.json()["detail"] == "rate_limited"


# --- "Change number" / Back / retry against a real active challenge ---------------------------


def test_change_number_replaces_the_active_challenge_instead_of_crashing_on_the_one_active_constraint(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    """The database allows only one unconsumed otp_challenges row per registration
    (uq_otp_challenges_one_active_per_registration). Resubmitting /mobile on a registration that already has
    one — which is exactly what the frontend's "Change number" and "Back then resubmit" do — must not
    attempt a second INSERT and crash; the old code must also stop working."""
    _enable_track11b(monkeypatch)
    _configure_dev_sms(monkeypatch)
    _configure_otp_keys(monkeypatch)
    _fix_generated_code(monkeypatch, "100001")
    pilot_registration_id = _register_interest(phaseb_client)
    first = _submit_mobile(phaseb_client, pilot_registration_id, phone_number="+919888800001")
    assert first.status_code == 200

    _fix_generated_code(monkeypatch, "200002")
    changed = _submit_mobile(phaseb_client, pilot_registration_id, phone_number="+919888800002")
    assert changed.status_code == 200

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        challenge_count = conn.execute(
            text("SELECT count(*) FROM otp_challenges WHERE pilot_registration_uuid = :id"), {"id": pilot_registration_id}
        ).scalar_one()
        phone_number = conn.execute(
            text("SELECT phone_number FROM pilot_registrations WHERE pilot_registration_uuid = :id"), {"id": pilot_registration_id}
        ).scalar_one()
    # Still exactly one challenge row — reused, not a second row alongside the first.
    assert challenge_count == 1
    assert phone_number == "+919888800002"

    # The old code (sent to the old number) no longer verifies; the new one does.
    old_code = _verify(phaseb_client, pilot_registration_id, "100001")
    assert old_code.status_code == 401
    new_code = _verify(phaseb_client, pilot_registration_id, "200002")
    assert new_code.status_code == 200


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
