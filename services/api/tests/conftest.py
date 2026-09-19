from __future__ import annotations

from collections.abc import Generator
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url


_APPROVED_TEST_HOSTS = {"127.0.0.1", "localhost", "::1"}
_APPROVED_DATABASE_SUFFIXES = ("_test", "_ci")


def validate_phasea_destructive_test_url(raw_url: str) -> str:
    parsed = make_url(raw_url)

    host = (parsed.host or "").strip().lower()
    if not host:
        raise RuntimeError("PHASEA_TEST_DATABASE_URL must include an explicit host")
    if host not in _APPROVED_TEST_HOSTS:
        raise RuntimeError("Destructive DB tests are restricted to localhost test hosts")

    database_name = (parsed.database or "").strip().lower()
    if not database_name:
        raise RuntimeError("PHASEA_TEST_DATABASE_URL must include a database name")
    if not database_name.endswith(_APPROVED_DATABASE_SUFFIXES):
        raise RuntimeError("Test database name must end with _test or _ci")

    return parsed.render_as_string(hide_password=False)


def resolve_phasea_destructive_test_url_from_env() -> str:
    import os

    raw_test_url = os.getenv("PHASEA_TEST_DATABASE_URL")
    if not raw_test_url:
        raise RuntimeError("PHASEA_TEST_DATABASE_URL is required for PostgreSQL-backed Phase A tests")

    if os.getenv("PHASEA_ALLOW_DESTRUCTIVE_DB_TESTS") != "1":
        raise RuntimeError("Set PHASEA_ALLOW_DESTRUCTIVE_DB_TESTS=1 to enable destructive DB tests")

    return validate_phasea_destructive_test_url(raw_test_url)


@pytest.fixture(scope="session")
def postgres_test_url() -> str:
    return resolve_phasea_destructive_test_url_from_env()


@pytest.fixture(scope="session")
def alembic_ini_path() -> Path:
    return Path(__file__).resolve().parents[1] / "alembic.ini"


@pytest.fixture()
def clean_database(postgres_test_url: str) -> Generator[None, None, None]:
    engine = create_engine(postgres_test_url, future=True)
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    try:
        yield
    finally:
        with engine.begin() as conn:
            conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
            conn.execute(text("CREATE SCHEMA public"))
        engine.dispose()
