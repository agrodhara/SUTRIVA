from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
import importlib
import os
from pathlib import Path

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url

from app.db.engine import dispose_engine


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


def phaseb_origin() -> str:
    return "http://testserver"


@contextmanager
def mapped_runtime_database_url(database_url: str):
    previous = os.getenv("DATABASE_URL")
    os.environ["DATABASE_URL"] = database_url
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("DATABASE_URL", None)
        else:
            os.environ["DATABASE_URL"] = previous


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


def phaseb_alembic_cfg(alembic_ini_path: Path, database_url: str) -> Config:
    cfg = Config(str(alembic_ini_path))
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


@pytest.fixture()
def phaseb_runtime_env(monkeypatch: pytest.MonkeyPatch, postgres_test_url: str) -> str:
    monkeypatch.setenv("DATABASE_URL", postgres_test_url)
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("ANONYMOUS_SESSION_ALLOWED_ORIGINS", phaseb_origin())
    monkeypatch.setenv("ANONYMOUS_SESSION_PRODUCTION_ORIGIN", phaseb_origin())
    monkeypatch.setenv("ANONYMOUS_SESSION_ALLOW_INSECURE_LOCALHOST", "true")
    monkeypatch.setenv("ANONYMOUS_RETENTION_PURGE_BATCH_SIZE", "3")
    dispose_engine()
    return postgres_test_url


@pytest.fixture()
def phaseb_upgraded_database(
    phaseb_runtime_env: str,
    alembic_ini_path: Path,
    clean_database: None,
) -> str:
    cfg = phaseb_alembic_cfg(alembic_ini_path, phaseb_runtime_env)
    with mapped_runtime_database_url(phaseb_runtime_env):
        command.upgrade(cfg, "head")
    dispose_engine()
    return phaseb_runtime_env


@pytest.fixture()
def phaseb_client(phaseb_upgraded_database: str) -> Generator[TestClient, None, None]:
    import app.main as app_main

    dispose_engine()
    app_module = importlib.reload(app_main)
    client = TestClient(app_module.app)
    try:
        yield client
    finally:
        client.close()
        dispose_engine()
