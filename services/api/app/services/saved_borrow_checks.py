from __future__ import annotations

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import SQLAlchemyError

from app.db.config import DatabaseConfigError, DatabaseNotConfiguredError, get_database_settings
from app.db.session import session_scope
from app.repositories.saved_borrow_checks import (
    SavedBorrowCheckRecord,
    get_saved_borrow_check_by_token_hash,
    insert_saved_borrow_check,
    purge_expired_and_deleted_saved_borrow_checks,
    soft_delete_saved_borrow_check,
)
from app.saved_borrow_check_config import get_saved_borrow_check_settings, get_saved_check_frontend_base_url
from app.saved_check_notice_versions import NOTICE_VERSIONS
from app.services.email import EmailProviderNotConfiguredError, EmailSendRejectedError, get_email_sender
from app.services.email import send_or_raise as send_email_or_raise

LOGGER = logging.getLogger(__name__)

# A short, bounded identifier for the exact notice text SaveCheckForm.tsx shows at the moment a save is
# requested — not the text itself, which lives in app/saved_check_notice_versions.py's NOTICE_VERSIONS,
# an append-only, immutable registry (see that module's docstring for the rules this is held to). Bump
# this, AND add a new entry there, whenever the notice copy changes — never edit an existing entry, so a
# past row stays attributable to what it actually agreed to, not silently reinterpreted under later
# wording. This is request evidence for a requested service action, not a consent record — see
# docs/execution/PERMISSION_RECORDS_ASSESSMENT.md for why those are kept distinct.
SAVE_CHECK_NOTICE_VERSION = "save-check-notice-v1-2026-10-15"
assert SAVE_CHECK_NOTICE_VERSION in NOTICE_VERSIONS, (
    "SAVE_CHECK_NOTICE_VERSION must have a matching, immutable entry in NOTICE_VERSIONS — "
    "a save must never be stamped with a version this registry doesn't recognize."
)

# How many raw bytes of randomness the retrieval token carries before URL-safe encoding — 256 bits, the
# same order of magnitude Python's own secrets module docs recommend for a security token, and large
# enough that a keyed (HMAC) hash buys no practical protection beyond a plain SHA-256 of the raw value
# (see alembic/versions/0008_saved_borrow_checks.py's column comment for why this differs from the OTP
# code's HMAC treatment).
_TOKEN_BYTES = 32


class SavedBorrowCheckError(Exception):
    def __init__(self, status_code: int, code: str) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _generate_token() -> str:
    return secrets.token_urlsafe(_TOKEN_BYTES)


@dataclass(frozen=True)
class SaveBorrowCheckOutcome:
    saved_borrow_check_uuid: str


def save_borrow_check(
    *,
    situation_key: str,
    anonymous_session_uuid: str | None,
    email: str,
    input_values: dict,
    provenance: str,
    result_title: str,
    result_headline: str,
    result_detail: str,
    result_insight: str,
    result_scenario: str,
    result_note: str,
    result_bars: list,
) -> SaveBorrowCheckOutcome:
    """Persists a snapshot and emails the visitor a retrieval link, in that order, inside one
    transaction-equivalent flow: if the email send is rejected, the whole attempt must not leave a saved
    row behind that the visitor has no way to reach — mirrors app/services/pilot.py's
    rollback-on-rejected-send discipline exactly, applied here to email instead of SMS.

    Raises SavedBorrowCheckError on any failure (db unavailable, email provider unconfigured or rejected)
    — never a fabricated "saved" response for a save that didn't actually complete and get delivered.
    """
    base_url = get_saved_check_frontend_base_url()
    if not base_url:
        # Fail closed before even touching the database: a save no one can ever retrieve (because the
        # link can't be built) is worse than no save at all.
        LOGGER.warning("saved-check save rejected: SAVED_CHECK_FRONTEND_BASE_URL is not configured")
        raise SavedBorrowCheckError(503, "saved_check_not_configured")

    settings = get_saved_borrow_check_settings()
    token = _generate_token()
    token_hash = _hash_token(token)
    expires_at = datetime.now(UTC) + timedelta(days=settings.retention_days)

    db_settings = get_database_settings()
    try:
        with session_scope(db_settings) as db:
            saved_borrow_check_uuid = insert_saved_borrow_check(
                db,
                situation_key=situation_key,
                anonymous_session_uuid=anonymous_session_uuid,
                access_email=email,
                input_values=input_values,
                provenance=provenance,
                result_title=result_title,
                result_headline=result_headline,
                result_detail=result_detail,
                result_insight=result_insight,
                result_scenario=result_scenario,
                result_note=result_note,
                result_bars=result_bars,
                notice_version=SAVE_CHECK_NOTICE_VERSION,
                retrieval_token_hash=token_hash,
                expires_at=expires_at,
            )

            # A URL *fragment* (after "#"), not a path segment: a fragment is never sent to any server in
            # an HTTP request, so this link never puts the token in the PWA's own server/proxy access log
            # either — the same reasoning that moved the API's own retrieval/delete calls from a path
            # parameter to a header. See docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md.
            link = f"{base_url}/saved#{token}"
            retention_days = settings.retention_days
            body = (
                "Here's the private link to the Sutriva check you asked to save:\n\n"
                f"{link}\n\n"
                f"This link works for {retention_days} days. It isn't shared with anyone else and isn't "
                "linked to any account. If you didn't request this, you can ignore this email.\n"
            )
            try:
                send_email_or_raise(
                    get_email_sender(), to_email=email, subject="Your saved Sutriva check", body_text=body,
                )
            except (EmailProviderNotConfiguredError, EmailSendRejectedError) as exc:
                # Rolling back the whole session_scope block, exactly like app/services/pilot.py does for
                # a rejected SMS send — no row survives for a link that was never actually sent.
                LOGGER.warning("saved-check email send failed; rolling back the save", extra={"category": "saved_check_email_error"})
                raise SavedBorrowCheckError(503, "email_send_failed") from exc
    except (DatabaseConfigError, DatabaseNotConfiguredError, SQLAlchemyError) as exc:
        LOGGER.warning("saved-check save unavailable", extra={"category": "saved_check_db_error"})
        raise SavedBorrowCheckError(503, "service_unavailable") from exc

    # Minimal save measurement — a structured log line, not a product_events row (adding one would mean
    # widening the ck_product_events_screen_name allowlist, deliberately out of scope this round — see
    # docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md). Only situation_key and provenance: never the email
    # address, the retrieval token, or any input/result value. This is enough for an operator to count
    # saves per situation from log aggregation; it is not a replacement for a real analytics event.
    #
    # The safe fields are interpolated directly into the message (not only passed via `extra`) — `extra`
    # populates LogRecord attributes that Python's *default* Formatter does not render into the printed
    # line at all (only a custom formatter referencing them would show them; this codebase configures
    # none). Caught by actually capturing real rendered log output rather than assuming a test harness's
    # view of LogRecord attributes was the same as what an operator would ever actually see — see
    # docs/execution/B1_SAVED_CHECK_LAUNCH_GAPS.md for the real, captured demonstration.
    LOGGER.info(
        "saved-check saved situation_key=%s provenance=%s", situation_key, provenance,
        extra={"category": "saved_check_measurement", "situation_key": situation_key, "provenance": provenance},
    )
    return SaveBorrowCheckOutcome(saved_borrow_check_uuid=saved_borrow_check_uuid)


def retrieve_saved_borrow_check(*, token: str) -> SavedBorrowCheckRecord:
    """Raises SavedBorrowCheckError(404, "not_found") for a wrong token, an expired one, or one belonging
    to a deleted check — deliberately the same outcome for all three (see
    get_saved_borrow_check_by_token_hash's docstring): an attacker probing tokens learns nothing about
    which failure mode applies, and a visitor sees one clear "no longer valid" state either way, matching
    B1_SAVED_CHECK_SPEC.md's acceptance checks.
    """
    settings = get_database_settings()
    try:
        with session_scope(settings) as db:
            record = get_saved_borrow_check_by_token_hash(db, retrieval_token_hash=_hash_token(token))
    except (DatabaseConfigError, DatabaseNotConfiguredError, SQLAlchemyError) as exc:
        LOGGER.warning("saved-check retrieval unavailable", extra={"category": "saved_check_db_error"})
        raise SavedBorrowCheckError(503, "service_unavailable") from exc

    now = datetime.now(UTC)
    if record is None or record.deleted_at is not None or record.expires_at <= now:
        # Deliberately no measurement log on the not-found path: logging per failed-token attempt would
        # itself be a token-guessing oracle in the logs (a count of attempts against a near-guess), and
        # the per-IP rate limiter (see app/routers/saved_borrow_checks.py) is the actual control against
        # that, not logging.
        raise SavedBorrowCheckError(404, "not_found")
    LOGGER.info(
        "saved-check retrieved situation_key=%s", record.situation_key,
        extra={"category": "saved_check_measurement", "situation_key": record.situation_key},
    )
    return record


def delete_saved_borrow_check(*, token: str) -> None:
    """Idempotent: deleting an already-deleted or nonexistent token still returns success-shaped
    behavior to the caller (see app/routers/saved_borrow_checks.py) — a visitor retrying a delete action
    (e.g. a double click) must never see an error for a check that is, either way, now gone.
    """
    settings = get_database_settings()
    try:
        with session_scope(settings) as db:
            soft_delete_saved_borrow_check(db, retrieval_token_hash=_hash_token(token))
    except (DatabaseConfigError, DatabaseNotConfiguredError, SQLAlchemyError) as exc:
        LOGGER.warning("saved-check deletion unavailable", extra={"category": "saved_check_db_error"})
        raise SavedBorrowCheckError(503, "service_unavailable") from exc


def purge_expired_and_deleted(*, batch_size: int | None = None) -> int:
    """Entry point for a scheduled purge job (not wired to any scheduler by this change — see
    B1_SAVED_CHECK_SPEC.md's Retention section and the Milestone 2 report for what remains to actually
    run this periodically). Returns the number of rows removed this call; call repeatedly until it
    returns 0 to fully drain a backlog, mirroring the existing anonymous-session purge job's own
    contract.
    """
    settings = get_saved_borrow_check_settings()
    db_settings = get_database_settings()
    with session_scope(db_settings) as db:
        return purge_expired_and_deleted_saved_borrow_checks(
            db, grace_hours=settings.delete_grace_hours, batch_size=batch_size or settings.purge_batch_size,
        )
