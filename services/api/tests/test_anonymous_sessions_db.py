from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.db.session import get_session_factory
from app.repositories.anonymous_continuity import create_anonymous_session, insert_token, load_locked_session_for_token
from app.services.anonymous_sessions import rotate_anonymous_session_token
from conftest import phaseb_origin


def test_token_insert_rejects_later_and_earlier_expiry_mismatch(phaseb_runtime_env: str, clean_database: None) -> None:
    from alembic import command
    from conftest import mapped_runtime_database_url, phaseb_alembic_cfg
    from pathlib import Path

    cfg = phaseb_alembic_cfg(Path(__file__).resolve().parents[1] / "alembic.ini", phaseb_runtime_env)
    with mapped_runtime_database_url(phaseb_runtime_env):
        command.upgrade(cfg, "head")

    engine = create_engine(phaseb_runtime_env, future=True)
    session = get_session_factory(__import__("app.db.config", fromlist=["get_database_settings"]).get_database_settings())()
    now = datetime.now(UTC)
    parent = create_anonymous_session(session, now=now, absolute_expires_at=now + timedelta(days=90))

    with pytest.raises(ValueError):
        insert_token(
            session,
            anonymous_session_uuid=parent["anonymous_session_uuid"],
            session_absolute_expires_at=parent["absolute_expires_at"],
            token_digest=b"0" * 32,
            issued_at=now,
            original_absolute_expires_at=parent["absolute_expires_at"] + timedelta(seconds=1),
            rotation_reason="issued",
            is_active=True,
            grace_expires_at=None,
        )
    with pytest.raises(ValueError):
        insert_token(
            session,
            anonymous_session_uuid=parent["anonymous_session_uuid"],
            session_absolute_expires_at=parent["absolute_expires_at"],
            token_digest=b"1" * 32,
            issued_at=now,
            original_absolute_expires_at=parent["absolute_expires_at"] - timedelta(seconds=1),
            rotation_reason="issued",
            is_active=True,
            grace_expires_at=None,
        )
    session.rollback()
    session.close()
    engine.dispose()


def test_partial_unique_index_allows_only_one_primary_token(phaseb_upgraded_database: str) -> None:
    engine = create_engine(phaseb_upgraded_database, future=True)
    now = datetime.now(UTC)
    expires_at = now + timedelta(days=90)
    with engine.begin() as conn:
        session_uuid = conn.execute(
            text(
                "INSERT INTO anonymous_sessions (first_seen_at, last_seen_at, absolute_expires_at, status) VALUES (:now, :now, :expires_at, 'active') RETURNING anonymous_session_uuid"
            ),
            {"now": now, "expires_at": expires_at},
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO anonymous_session_tokens (anonymous_session_uuid, token_digest, issued_at, original_absolute_expires_at, rotation_reason, is_active) VALUES (:session_uuid, :digest, :now, :expires_at, 'issued', true)"
            ),
            {"session_uuid": session_uuid, "digest": b"a" * 32, "now": now, "expires_at": expires_at},
        )
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO anonymous_session_tokens (anonymous_session_uuid, token_digest, issued_at, original_absolute_expires_at, rotation_reason, is_active) VALUES (:session_uuid, :digest, :now, :expires_at, 'issued', true)"
                ),
                {"session_uuid": session_uuid, "digest": b"b" * 32, "now": now, "expires_at": expires_at},
            )


def test_rotation_keeps_single_grace_and_single_primary_token(phaseb_client, phaseb_upgraded_database: str) -> None:
    created = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    rotated = rotate_anonymous_session_token(created.cookies.get("sutriva_anon_session"))
    assert rotated.raw_token

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        primary_count = conn.execute(text("SELECT COUNT(*) FROM anonymous_session_tokens WHERE is_active = true AND grace_expires_at IS NULL")).scalar_one()
        grace_count = conn.execute(text("SELECT COUNT(*) FROM anonymous_session_tokens WHERE is_active = true AND grace_expires_at IS NOT NULL")).scalar_one()
    assert primary_count == 1
    assert grace_count == 1


def test_session_status_constraint_rejects_invalid_timestamp_state_combination(phaseb_upgraded_database: str) -> None:
    engine = create_engine(phaseb_upgraded_database, future=True)
    now = datetime.now(UTC)
    expires_at = now + timedelta(days=90)
    with engine.begin() as conn:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO anonymous_sessions (first_seen_at, last_seen_at, absolute_expires_at, status, revoked_at) VALUES (:now, :now, :expires_at, 'active', :now)"
                ),
                {"now": now, "expires_at": expires_at},
            )
    with engine.begin() as conn:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    """
                    INSERT INTO anonymous_sessions (
                        first_seen_at,
                        last_seen_at,
                        absolute_expires_at,
                        status,
                        revoked_at,
                        expired_at,
                        revocation_reason
                    )
                    VALUES (
                        :now,
                        :now,
                        :expires_at,
                        'revoked',
                        :now,
                        :now,
                        'compromised'
                    )
                    """
                ),
                {"now": now, "expires_at": expires_at},
            )
