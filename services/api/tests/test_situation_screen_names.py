from __future__ import annotations

from datetime import UTC, datetime

import pytest
from fastapi.testclient import TestClient

from conftest import phaseb_origin


def test_alembic_head_is_0007(postgres_test_url: str, alembic_ini_path, clean_database: None) -> None:
    from alembic import command
    from sqlalchemy import create_engine, text

    from conftest import mapped_runtime_database_url, phaseb_alembic_cfg

    cfg = phaseb_alembic_cfg(alembic_ini_path, postgres_test_url)
    with mapped_runtime_database_url(postgres_test_url):
        command.upgrade(cfg, "head")
    engine = create_engine(postgres_test_url, future=True)
    with engine.connect() as conn:
        revision = conn.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
    assert revision == "0007_situation_pilot_interest"


def _bootstrap_and_post(client: TestClient, **overrides) -> "object":
    bootstrap = client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    cookie = bootstrap.cookies
    base = {
        "event_id": "evt-1",
        "event_type": "step_viewed",
        "journey_run_id": "run-1",
        "journey": "comfortable_borrowing",
        "version": "test",
        "timestamp": datetime.now(UTC).isoformat(),
    }
    base.update(overrides)
    return client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookie, json=base)


def test_a_new_situation_screen_name_is_accepted_for_its_own_journey(phaseb_client: TestClient) -> None:
    response = _bootstrap_and_post(phaseb_client, journey="comfortable_borrowing", screen_name="borrow_offer_arrival")
    assert response.status_code == 200, response.text


def test_a_new_situation_screen_name_is_rejected_for_the_wrong_journey(phaseb_client: TestClient) -> None:
    response = _bootstrap_and_post(phaseb_client, journey="money_value", screen_name="borrow_offer_arrival")
    assert response.status_code == 422


def test_result_declared_requires_one_of_the_new_result_screen_names(phaseb_client: TestClient) -> None:
    ok = _bootstrap_and_post(
        phaseb_client, event_type="result_declared", journey="money_value", screen_name="rewards_fee_result"
    )
    assert ok.status_code == 200, ok.text

    missing = _bootstrap_and_post(phaseb_client, event_type="result_declared", journey="money_value", screen_name=None)
    assert missing.status_code == 422


def test_an_inputs_screen_name_is_rejected_on_a_result_declared_event(phaseb_client: TestClient) -> None:
    response = _bootstrap_and_post(
        phaseb_client, event_type="result_declared", journey="comfortable_borrowing", screen_name="borrow_offer_inputs"
    )
    assert response.status_code == 422


def test_the_original_eight_screen_names_still_work_unchanged(phaseb_client: TestClient) -> None:
    response = _bootstrap_and_post(phaseb_client, journey="comfortable_borrowing", screen_name="borrow_monthly_position")
    assert response.status_code == 200, response.text


@pytest.mark.parametrize(
    "screen_name",
    [
        "borrow_debt_arrival", "borrow_debt_inputs", "borrow_debt_result",
        "borrow_purchase_arrival", "borrow_purchase_inputs", "borrow_purchase_result",
        "borrow_offer_arrival", "borrow_offer_inputs", "borrow_offer_result",
        "borrow_rejected_arrival", "borrow_rejected_inputs", "borrow_rejected_result",
    ],
)
def test_every_borrow_situation_screen_name_is_accepted(phaseb_client: TestClient, screen_name: str) -> None:
    event_type = "result_declared" if screen_name.endswith("_result") else "step_viewed"
    response = _bootstrap_and_post(phaseb_client, event_type=event_type, journey="comfortable_borrowing", screen_name=screen_name)
    assert response.status_code == 200, (screen_name, response.text)


@pytest.mark.parametrize(
    "screen_name",
    [
        "rewards_fee_arrival", "rewards_fee_inputs", "rewards_fee_result",
        "rewards_fit_arrival", "rewards_fit_inputs", "rewards_fit_result",
        "rewards_balance_arrival", "rewards_balance_inputs", "rewards_balance_result",
        "rewards_multi_arrival", "rewards_multi_inputs", "rewards_multi_result",
        "rewards_unused_arrival", "rewards_unused_inputs", "rewards_unused_result",
    ],
)
def test_every_rewards_situation_screen_name_is_accepted(phaseb_client: TestClient, screen_name: str) -> None:
    event_type = "result_declared" if screen_name.endswith("_result") else "step_viewed"
    response = _bootstrap_and_post(phaseb_client, event_type=event_type, journey="money_value", screen_name=screen_name)
    assert response.status_code == 200, (screen_name, response.text)
