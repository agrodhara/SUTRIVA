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
    # Token travels as a header, never a path or query value — see
    # docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md for why (it's a bearer credential; a path/query value is
    # what a default access-log format captures on every request).
    headers = {"Origin": origin if origin is not None else phaseb_origin(), "X-Saved-Check-Token": token}
    return client.get("/v1/saved-borrow-checks", headers=headers)


def _delete(client: TestClient, token: str, origin: str | None = None):
    headers = {"Origin": origin if origin is not None else phaseb_origin(), "X-Saved-Check-Token": token}
    return client.request("DELETE", "/v1/saved-borrow-checks", headers=headers)


def _row_count(postgres_test_url: str) -> int:
    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        return conn.execute(text("SELECT count(*) FROM saved_borrow_checks")).scalar_one()


# --- Flag gating -------------------------------------------------------------------------------


def test_all_routes_404_when_saved_check_is_disabled(phaseb_client: TestClient) -> None:
    assert _save(phaseb_client).status_code == 404
    assert _retrieve(phaseb_client, "anything").status_code == 404
    assert _delete(phaseb_client, "anything").status_code == 404


def test_a_request_with_no_token_header_at_all_still_404s_while_disabled_not_422(phaseb_client: TestClient) -> None:
    # Regression test for a real bug caught before this shipped: a *required* FastAPI header parameter is
    # validated before the route body (and _require_saved_check_enabled) ever runs, so omitting the header
    # entirely returned 422 even while the feature was disabled — leaking that this route exists through
    # the one path meant to be indistinguishable from "doesn't exist." Fixed by making the header optional
    # and checking it only after the enabled check. This test calls the routes with no
    # X-Saved-Check-Token header at all, not just an empty/wrong one.
    get_response = phaseb_client.get("/v1/saved-borrow-checks", headers={"Origin": phaseb_origin()})
    assert get_response.status_code == 404
    assert get_response.json()["detail"] == "feature_disabled"

    delete_response = phaseb_client.request("DELETE", "/v1/saved-borrow-checks", headers={"Origin": phaseb_origin()})
    assert delete_response.status_code == 404
    assert delete_response.json()["detail"] == "feature_disabled"


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


def test_responses_carrying_a_stored_result_are_never_cacheable(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A URL fragment and a header keep the token out of access logs (see the router's own docstring) —
    # that says nothing about HTTP caching, a separate control. Without an explicit Cache-Control header,
    # a browser's own heuristics or a shared intermediate cache could otherwise retain a GET response
    # carrying stored financial figures, e.g. on a shared device. Checked on the actual save (POST) and
    # retrieve (GET) success responses, where the sensitive content actually lives.
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    _fix_generated_token(monkeypatch)

    save_response = _save(phaseb_client)
    assert save_response.status_code == 200
    assert save_response.headers["cache-control"] == "no-store, no-cache, must-revalidate, private"
    assert save_response.headers["pragma"] == "no-cache"

    retrieve_response = _retrieve(phaseb_client, "test-fixed-token")
    assert retrieve_response.status_code == 200
    assert retrieve_response.headers["cache-control"] == "no-store, no-cache, must-revalidate, private"
    assert retrieve_response.headers["pragma"] == "no-cache"


def test_a_save_records_the_current_notice_version_as_request_evidence(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch, phaseb_upgraded_database: str
) -> None:
    # Request evidence, not a consent record (see docs/execution/PERMISSION_RECORDS_ASSESSMENT.md) — but a
    # save should still be attributable to the notice wording actually shown at the time, in case that
    # wording is ever revised later. notice_version is intentionally not exposed in the retrieval
    # response (it's operator-facing evidence, not something the visitor needs to see on the page).
    from app.services.saved_borrow_checks import SAVE_CHECK_NOTICE_VERSION

    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    assert _save(phaseb_client).status_code == 200

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        stored = conn.execute(text("SELECT notice_version FROM saved_borrow_checks")).scalar_one()
    assert stored == SAVE_CHECK_NOTICE_VERSION


def test_importing_the_app_configures_the_measurement_logger_to_actually_produce_output() -> None:
    # Regression test for a real gap caught by actually running the server and capturing its real stdout
    # (not inferred): nothing in this codebase calls logging.basicConfig or configures any handler
    # anywhere, so Python's root logger has no handler and its default WARNING level suppresses every
    # INFO-level measurement log call — meaning, before app/main.py's fix, these log lines produced *no
    # output at all* in any real run, not just none visible to this test's own tooling. Importing
    # app.main (done by every test in this file via the phaseb_client fixture, and by the real server at
    # startup) must leave this logger able to actually emit.
    import logging

    import app.main  # noqa: F401 — imported for its side effect of configuring this logger

    target_logger = logging.getLogger("app.services.saved_borrow_checks")
    assert target_logger.getEffectiveLevel() <= logging.INFO
    assert target_logger.handlers, "the measurement logger must have a handler, or INFO logs go nowhere"


def test_a_successful_save_and_retrieval_log_minimal_safe_measurement_only(
    phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Minimal measurement, per instruction: situation_key/provenance only, never the email address, the
    # retrieval token, or any input/result value — see app/services/saved_borrow_checks.py's log lines.
    #
    # Not pytest's `caplog` fixture, and the target logger is explicitly re-enabled here — traced to a
    # real cause, not guessed: `command.upgrade(...)` (run by the `phaseb_upgraded_database` fixture this
    # test depends on via `phaseb_client`) calls Alembic's own `fileConfig(alembic.ini)` internally, which
    # defaults to `disable_existing_loggers=True` — this disables every *already-created* logger not
    # explicitly listed in alembic.ini's `[loggers]` section (only `root`/`sqlalchemy`/`alembic` are),
    # including this module's own `LOGGER`, as an unrelated side effect of running a migration. Confirmed
    # directly (not inferred) by printing `LOGGER.disabled` at the exact call site: `True`, only when a
    # `phaseb_*`-fixture-driven alembic upgrade had already run in this test. This is a pre-existing
    # property of how this test suite invokes Alembic, not introduced by this feature, and plausibly
    # affects any future test that both uses `phaseb_client` and asserts on application log output — worth
    # knowing about repo-wide, not just here.
    _enable_saved_check(monkeypatch)
    _configure_email(monkeypatch)
    _fix_generated_token(monkeypatch)

    import logging

    records: list[logging.LogRecord] = []

    class _CollectingHandler(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    target_logger = logging.getLogger("app.services.saved_borrow_checks")
    handler = _CollectingHandler(level=logging.INFO)
    previous_level = target_logger.level
    previous_disabled = target_logger.disabled
    target_logger.addHandler(handler)
    target_logger.setLevel(logging.INFO)
    target_logger.disabled = False
    try:
        assert _save(phaseb_client).status_code == 200
        assert _retrieve(phaseb_client, "test-fixed-token").status_code == 200
    finally:
        target_logger.removeHandler(handler)
        target_logger.setLevel(previous_level)
        target_logger.disabled = previous_disabled

    measurement_records = [r for r in records if getattr(r, "category", None) == "saved_check_measurement"]
    assert len(measurement_records) == 2
    saved_record, retrieved_record = measurement_records
    assert saved_record.situation_key == "offer"
    assert saved_record.provenance == "own"
    assert retrieved_record.situation_key == "offer"

    # The safe fields must appear in the *rendered* message text (what `%(message)s` or any plain
    # formatter would actually print), not only as LogRecord attributes a test harness can see via
    # `extra` but a real log file never would — the exact gap caught and fixed this round (see
    # app/services/saved_borrow_checks.py's log-call comments).
    assert saved_record.getMessage() == "saved-check saved situation_key=offer provenance=own"
    assert retrieved_record.getMessage() == "saved-check retrieved situation_key=offer"

    full_text = "\n".join(r.getMessage() + str(r.__dict__) for r in records)
    assert "visitor@example.com" not in full_text
    assert "test-fixed-token" not in full_text
    assert _RESULT_FIELDS["result_title"] not in full_text


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


def test_retrieval_with_no_token_header_is_not_found_once_enabled(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    _enable_saved_check(monkeypatch)
    response = phaseb_client.get("/v1/saved-borrow-checks", headers={"Origin": phaseb_origin()})
    assert response.status_code == 404
    assert response.json()["detail"] == "not_found"


def test_the_token_never_appears_in_the_request_url_itself(phaseb_client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    # The whole point of the header-based design: confirms this directly rather than only by inspecting the
    # router source. A path/query value is what a reverse proxy or server's default access-log format
    # captures on every request; a header is not, by default.
    _enable_saved_check(monkeypatch)
    response = _retrieve(phaseb_client, "a-sensitive-token-value")
    assert "a-sensitive-token-value" not in str(response.request.url)


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
    # An absent header is just one more case this same idempotent contract already covers — not a
    # different response to invent.
    no_header_response = phaseb_client.request("DELETE", "/v1/saved-borrow-checks", headers={"Origin": phaseb_origin()})
    assert no_header_response.status_code == 200
    assert no_header_response.json() == {"status": "deleted"}


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
