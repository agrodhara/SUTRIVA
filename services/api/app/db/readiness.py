from __future__ import annotations

from pathlib import Path
from typing import Any

from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.db.config import (
    DatabaseConfigError,
    DatabaseNotConfiguredError,
    get_database_settings,
    require_database_url,
)
from app.db.engine import get_engine


def _alembic_config_path() -> Path:
    return Path(__file__).resolve().parents[2] / "alembic.ini"


def _expected_head_revision() -> str:
    config = Config(str(_alembic_config_path()))
    script = ScriptDirectory.from_config(config)
    return script.get_current_head()


def _current_database_revision() -> str | None:
    settings = get_database_settings()
    engine = get_engine(settings)

    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
        try:
            row = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).first()
        except SQLAlchemyError:
            return None
    if row is None:
        return None
    return str(row[0])


def get_readiness_status() -> dict[str, Any]:
    try:
        settings = get_database_settings()
    except DatabaseNotConfiguredError:
        return {
            "status": "error",
            "database": "required_but_not_configured",
            "migration": "unknown",
        }
    except DatabaseConfigError:
        return {
            "status": "error",
            "database": "config_invalid",
            "migration": "unknown",
        }

    if not settings.database_url:
        if settings.database_required:
            return {
                "status": "error",
                "database": "required_but_not_configured",
                "migration": "unknown",
            }
        return {
            "status": "ok",
            "database": "not_configured",
            "migration": "not_configured",
        }

    try:
        require_database_url(settings)
    except DatabaseNotConfiguredError:
        return {
            "status": "error",
            "database": "required_but_not_configured",
            "migration": "unknown",
        }

    try:
        expected = _expected_head_revision()
    except Exception:
        return {
            "status": "error",
            "database": "reachable_unknown",
            "migration": "head_resolution_failed",
        }

    try:
        current = _current_database_revision()
    except SQLAlchemyError:
        return {
            "status": "error",
            "database": "unreachable",
            "migration": "unknown",
        }
    except Exception:
        return {
            "status": "error",
            "database": "unreachable",
            "migration": "unknown",
        }

    if current != expected:
        return {
            "status": "error",
            "database": "reachable",
            "migration": "out_of_date",
        }

    return {
        "status": "ok",
        "database": "reachable",
        "migration": "current",
    }
