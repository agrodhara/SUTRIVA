from __future__ import annotations

from time import monotonic

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest

from app.main import app


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _alembic_cfg(path: str, database_url: str) -> Config:
    cfg = Config(path)
    cfg.set_main_option("sqlalchemy.url", database_url)
    return cfg


def test_liveness_stays_ok_when_database_unreachable(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:1/sutriva_phasea_test")

    health = client.get("/health")
    ready = client.get("/ready")

    assert health.status_code == 200
    assert ready.status_code == 503
    assert "user" not in ready.text
    assert "pass" not in ready.text


def test_readiness_optional_without_database(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "false")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["database"] == "not_configured"


def test_readiness_required_without_database(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.delenv("DATABASE_URL", raising=False)

    ready = client.get("/ready")
    assert ready.status_code == 503
    assert ready.json()["database"] == "required_but_not_configured"


def test_readiness_unreachable_database(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@127.0.0.1:1/sutriva_phasea_test")

    ready = client.get("/ready")
    assert ready.status_code == 503
    assert ready.json()["database"] == "unreachable"


def test_readiness_timeout_is_bounded_for_unresponsive_target(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("DATABASE_CONNECT_TIMEOUT", "1")
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://user:pass@10.255.255.1:5432/sutriva_phasea_test")

    started = monotonic()
    ready = client.get("/ready")
    elapsed = monotonic() - started

    assert ready.status_code == 503
    assert ready.json()["database"] == "unreachable"
    assert "10.255.255.1" not in ready.text
    assert "user" not in ready.text
    assert "pass" not in ready.text
    # Ensures DB readiness failure does not wait for long OS-level TCP timeouts.
    assert elapsed < 5.0


def test_readiness_success_when_revision_current(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    postgres_test_url: str,
    alembic_ini_path,
    clean_database: None,
) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("DATABASE_URL", postgres_test_url)

    cfg = _alembic_cfg(str(alembic_ini_path), postgres_test_url)
    command.upgrade(cfg, "head")

    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["database"] == "reachable"
    assert ready.json()["migration"] == "current"


def test_readiness_fails_when_revision_out_of_date(
    monkeypatch: pytest.MonkeyPatch,
    client: TestClient,
    postgres_test_url: str,
    clean_database: None,
) -> None:
    monkeypatch.setenv("DATABASE_REQUIRED", "true")
    monkeypatch.setenv("DATABASE_URL", postgres_test_url)

    ready = client.get("/ready")
    assert ready.status_code == 503
    assert ready.json()["database"] == "reachable"
    assert ready.json()["migration"] == "out_of_date"
