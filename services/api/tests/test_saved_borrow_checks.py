from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from conftest import phaseb_origin


def _enable_saved_check(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.routers.saved_borrow_checks.saved_check_enabled", lambda: True)


def _configure_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SAVED_CHECK_EMAIL_PROVIDER", "logging-dev-only")
    monkeypatch.setenv("SAVED_CHECK_FRONTEND_BASE_URL", "https://app.sutriva.com")


def _fix_generated_token(monkeypatch: pytest.MonkeyPatch, token: str = "test-fixed-token") -> None:
    monkeypatch.setattr("app.services.saved_borrow_checks._generate_token", lambda: token)


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    # Every call in this file goes through the same TestClient, which gives a fixed client host
    # ("testclient") — without a reset, per-IP limiter state would leak between unrelated tests.
    from app.routers.saved_borrow_checks import _delete_limiter, _retrieve_limiter, _save_limiter

    _save_limiter.reset()
    _retrieve_limiter.reset()
    _delete_limiter.reset()
    yield


_LOAN_OFFER_INPUT = {"principal": 500000, "emi": 12000, "months": 48, "income": 60000, "costs": 20000}

_RESULT_FIELDS = {
    "result_title": "Loan offer check",
    "result_headline": "This looks manageable",
    "result_detail": "Your EMI fits within a comfortable share of income.",
    "result_insight": "Keep an emergency buffer alongside this EMI.",
    "result_scenario": "If your income dropped 10%, this would still be manageable.",
    "result_note": "Educational estimate, not advice.",
    "result_bars": [{"label": "EMI share", "value": 20.0, "tone": "positive"}],
}


def _save_payload(**overrides) -> dict:
    payload = {
        "situation_key": "offer",
        "input_values": dict(_LOAN_OFFER_INPUT),
        "provenance": "own",
        "email": "visitor@example.com",
        **_RESULT_FIELDS,
    }
    payload.update(overrides)
    return payload


def _save(client: TestClient, origin: str | None = None, **overrides):
    headers = {"Origin": origin if origin is not None else phaseb_origin()}
    return client.post("/v1/saved-borrow-checks", json=_save_payload(**overrides), headers=headers)


def _retrieve(client: TestClient, token: str, origin: str | None = None):
    headers = {"Origin": origin if origin is not None else phaseb_origin()}
    return client.get(f"/v1/saved-borrow-checks/{token}", headers=headers)


def _delete(client: TestClient, token: str, origin: str | None = None):
    headers = {"Origin": origin if origin is not None else phaseb_origin()}
    return client.request("DELETE", f"/v1/saved-borrow-checks/{token}", headers=headers)


def _row_count(postgres_test_url: str) -> int:
    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM saved_borrow_checks")).scalar_one()


# --- Flag gating -------------------------------------------------------------------------------


def test_all_routes_404_when_saved_check_is_disabled(phaseb_client: TestClient) -> None:
    assert _save(phaseb_client).status_code == 404
    assert _retrieve(phaseb_client, "anything").status_code == 404
    assert _delete(phaseb_client, "anything").status_code == 404


def test_every_route_rejects_a_missing_or_wrong_origin(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)

    assert _save(phaseb_client, origin="https://evil.example.com").status_code == 403
    assert _retrieve(phaseb_client, "anything", origin="https://evil.example.com").status_code == 403
    assert _delete(phaseb_client, "anything", origin="https://evil.example.com").status_code == 403


# --- Save ----------------------------------------------------------------------------------------


def test_a_valid_save_persists_and_can_be_retrieved_byte_identical(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    _fix_generated_token(monkeypatch)

    response = _save(phaseb_client)
    assert response.status_code == 200, response.text
    assert response.json() == {"status": "saved"}
    assert _row_count(phaseb_upgraded_database) == 1

    retrieved = _retrieve(phaseb_client, "test-fixed-token")
    assert retrieved.status_code == 200, retrieved.text
    body = retrieved.json()
    assert body["situation_key"] == "offer"
    assert body["input_values"] == _LOAN_OFFER_INPUT
    assert body["provenance"] == "own"
    assert body["result_title"] == _RESULT_FIELDS["result_title"]
    assert body["result_bars"] == _RESULT_FIELDS["result_bars"]


def test_save_never_exposes_the_token_itself_in_the_response(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    _fix_generated_token(monkeypatch)

    response = _save(phaseb_client)
    assert response.status_code == 200
    assert "test-fixed-token" not in response.text
    assert "token" not in response.json()


def test_save_is_rejected_with_input_values_that_do_not_match_the_situations_own_fields(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)

    response = _save(phaseb_client, input_values={"not_a_real_field": 1})
    assert response.status_code == 422
    assert _row_count(phaseb_upgraded_database) == 0


def test_save_is_rejected_with_input_values_for_a_different_situations_shape(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)

    # "offer" situation_key but "debt" situation's own fields — must not be accepted as free-form JSON.
    response = _save(
        phaseb_client,
        input_values={"income": 60000, "essentials": 20000, "emis": 10000, "overdue": "no"},
    )
    assert response.status_code == 422
    assert _row_count(phaseb_upgraded_database) == 0


def test_save_rejects_an_invalid_email(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)

    response = _save(phaseb_client, email="not-an-email")
    assert response.status_code == 422
    assert _row_count(phaseb_upgraded_database) == 0


def test_save_fails_closed_when_no_email_provider_is_configured(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    monkeypatch.setenv("SAVED_CHECK_FRONTEND_BASE_URL", "https://app.sutriva.com")
    monkeypatch.delenv("SAVED_CHECK_EMAIL_PROVIDER", raising=False)

    response = _save(phaseb_client)
    assert response.status_code == 503
    assert response.json()["detail"] == "saved_check_not_configured" or response.json()["detail"] == "email_send_failed"
    assert _row_count(phaseb_upgraded_database) == 0


def test_save_fails_closed_when_frontend_base_url_is_not_configured(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    monkeypatch.setenv("SAVED_CHECK_EMAIL_PROVIDER", "logging-dev-only")
    monkeypatch.delenv("SAVED_CHECK_FRONTEND_BASE_URL", raising=False)

    response = _save(phaseb_client)
    assert response.status_code == 503
    assert response.json()["detail"] == "saved_check_not_configured"
    assert _row_count(phaseb_upgraded_database) == 0


def test_a_rejected_email_send_never_produces_a_saved_row(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)

    from app.services.email import EmailSendResult

    class RejectingEmailSender:
        def send(self, *, to_email: str, subject: str, body_text: str) -> EmailSendResult:
            return EmailSendResult(provider="test-rejecting", accepted=False)

    monkeypatch.setattr("app.services.saved_borrow_checks.get_email_sender", lambda: RejectingEmailSender())

    response = _save(phaseb_client)
    assert response.status_code == 503
    assert response.json()["detail"] == "email_send_failed"
    # Rolled back: no row survives for a link that was never actually sent.
    assert _row_count(phaseb_upgraded_database) == 0


def test_saving_the_same_check_twice_creates_two_independent_rows_not_an_update(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)

    tokens = iter(["token-one", "token-two"])
    monkeypatch.setattr("app.services.saved_borrow_checks._generate_token", lambda: next(tokens))

    assert _save(phaseb_client).status_code == 200
    assert _save(phaseb_client).status_code == 200
    assert _row_count(phaseb_upgraded_database) == 2

    first = _retrieve(phaseb_client, "token-one")
    second = _retrieve(phaseb_client, "token-two")
    assert first.status_code == 200
    assert second.status_code == 200


# --- Retrieval -------------------------------------------------------------------------------


def test_a_wrong_token_returns_not_found(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_saved_check(monkeypatch)
    response = _retrieve(phaseb_client, "no-such-token")
    assert response.status_code == 404
    assert response.json()["detail"] == "not_found"


def test_an_expired_saved_check_is_not_retrievable(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    _fix_generated_token(monkeypatch)

    assert _save(phaseb_client).status_code == 200

    # Moving both created_at and expires_at into the past (not just expires_at) simulates time having
    # actually elapsed, respecting ck_saved_borrow_checks_expiry_after_creation — that constraint exists
    # to catch a nonsensical insert (expiry before creation), not to prevent a legitimately old row from
    # having since passed its own expiry, which is exactly what happens in production as time passes.
    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE saved_borrow_checks SET created_at = :created, expires_at = :expired"),
            {"created": datetime.now(UTC) - timedelta(days=100), "expired": datetime.now(UTC) - timedelta(days=1)},
        )

    response = _retrieve(phaseb_client, "test-fixed-token")
    assert response.status_code == 404
    assert response.json()["detail"] == "not_found"


def test_retrieval_is_reusable_until_expiry_not_single_use(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    _fix_generated_token(monkeypatch)

    assert _save(phaseb_client).status_code == 200
    first = _retrieve(phaseb_client, "test-fixed-token")
    second = _retrieve(phaseb_client, "test-fixed-token")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json() == second.json()


# --- Deletion / withdrawal --------------------------------------------------------------------


def test_deleting_a_saved_check_makes_it_no_longer_retrievable(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    _fix_generated_token(monkeypatch)

    assert _save(phaseb_client).status_code == 200
    delete_response = _delete(phaseb_client, "test-fixed-token")
    assert delete_response.status_code == 200
    assert delete_response.json() == {"status": "deleted"}

    retrieve_response = _retrieve(phaseb_client, "test-fixed-token")
    assert retrieve_response.status_code == 404
    assert retrieve_response.json()["detail"] == "not_found"

    # Soft-deleted, not hard-deleted yet — the purge job (tested separately) owns the actual row removal.
    assert _row_count(phaseb_upgraded_database) == 1


def test_deleting_an_already_deleted_or_nonexistent_token_is_idempotent(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    _fix_generated_token(monkeypatch)

    assert _save(phaseb_client).status_code == 200
    assert _delete(phaseb_client, "test-fixed-token").status_code == 200
    # Deleting again, and deleting a token that never existed, both still report success.
    assert _delete(phaseb_client, "test-fixed-token").status_code == 200
    assert _delete(phaseb_client, "no-such-token-ever").status_code == 200


def test_deleting_one_saved_check_does_not_affect_another_visitors_row(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)

    tokens = iter(["token-mine", "token-someone-elses"])
    monkeypatch.setattr("app.services.saved_borrow_checks._generate_token", lambda: next(tokens))

    assert _save(phaseb_client).status_code == 200
    assert _save(phaseb_client).status_code == 200

    assert _delete(phaseb_client, "token-mine").status_code == 200
    # The other visitor's row is untouched and still retrievable — unauthorized/cross-token deletion is
    # structurally impossible since deletion only ever targets the exact hash of the token presented.
    other = _retrieve(phaseb_client, "token-someone-elses")
    assert other.status_code == 200


# --- Retention / purge -------------------------------------------------------------------------


def test_the_purge_job_removes_expired_rows_but_leaves_active_ones(
    phaseb_upgraded_database: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.saved_borrow_checks import purge_expired_and_deleted

    # The "expired" row's created_at is also backdated, to satisfy ck_saved_borrow_checks_expiry_after_
    # creation (expires_at > created_at) while still landing in the past relative to now() — see the
    # identical note in test_an_expired_saved_check_is_not_retrievable above.
    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO saved_borrow_checks (
                    situation_key, access_email, input_values, provenance, result_title, result_headline,
                    result_detail, result_insight, result_scenario, result_note, result_bars,
                    retrieval_token_hash, created_at, expires_at
                ) VALUES
                ('offer', 'a@example.com', '{}', 'own', 't', 'h', 'd', 'i', 's', 'n', '[]', 'hash-expired', :old_created, :past),
                ('offer', 'a@example.com', '{}', 'own', 't', 'h', 'd', 'i', 's', 'n', '[]', 'hash-active', now(), :future)
                """
            ),
            {
                "old_created": datetime.now(UTC) - timedelta(days=100),
                "past": datetime.now(UTC) - timedelta(days=1),
                "future": datetime.now(UTC) + timedelta(days=30),
            },
        )

    removed = purge_expired_and_deleted(batch_size=100)
    assert removed == 1
    with engine.connect() as conn:
        remaining = conn.execute(text("SELECT retrieval_token_hash FROM saved_borrow_checks")).scalars().all()
    assert remaining == ["hash-active"]


def test_the_purge_job_removes_soft_deleted_rows_past_the_grace_window_but_not_before_it(
    phaseb_upgraded_database: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.saved_borrow_checks import purge_expired_and_deleted

    monkeypatch.setenv("SAVED_CHECK_DELETE_GRACE_HOURS", "24")

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                INSERT INTO saved_borrow_checks (
                    situation_key, access_email, input_values, provenance, result_title, result_headline,
                    result_detail, result_insight, result_scenario, result_note, result_bars,
                    retrieval_token_hash, expires_at, deleted_at
                ) VALUES
                ('offer', 'a@example.com', '{}', 'own', 't', 'h', 'd', 'i', 's', 'n', '[]', 'hash-old-delete', :future, :old_delete),
                ('offer', 'a@example.com', '{}', 'own', 't', 'h', 'd', 'i', 's', 'n', '[]', 'hash-recent-delete', :future, :recent_delete)
                """
            ),
            {
                "future": datetime.now(UTC) + timedelta(days=30),
                "old_delete": datetime.now(UTC) - timedelta(hours=48),
                "recent_delete": datetime.now(UTC) - timedelta(hours=1),
            },
        )

    removed = purge_expired_and_deleted(batch_size=100)
    assert removed == 1
    with engine.connect() as conn:
        remaining = conn.execute(text("SELECT retrieval_token_hash FROM saved_borrow_checks")).scalars().all()
    assert remaining == ["hash-recent-delete"]
