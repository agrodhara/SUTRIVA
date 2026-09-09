import json
import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

PROHIBITED_FIELDS = ["name", "email", "phone", "pan", "aadhaar", "account_number", "card_number"]


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_borrow_better_quick_check():
    response = client.post("/v1/borrow-better/quick-check", json={
        "declared_monthly_income": 100000,
        "existing_monthly_emi": 20000,
        "requested_loan_amount": 500000,
        "requested_tenor_months": 36,
        "indicative_interest_rate_pa": 0.14,
        "monthly_non_emi_commitments": 15000,
        "income_verified": False
    })
    assert response.status_code == 200
    body = response.json()
    assert "decision" in body
    assert "estimated_emi" in body
    assert body["policy_version"] == "borrow_better_v0_1"


def test_borrow_better_quick_check_returns_audit_event_id(monkeypatch, tmp_path):
    audit_path = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_path))

    response = client.post("/v1/borrow-better/quick-check", json={
        "declared_monthly_income": 100000,
        "existing_monthly_emi": 20000,
        "requested_loan_amount": 500000,
        "requested_tenor_months": 36,
        "indicative_interest_rate_pa": 0.14,
        "monthly_non_emi_commitments": 15000,
        "income_verified": False
    })
    assert response.status_code == 200
    body = response.json()

    assert "audit_event_id" in body
    assert isinstance(body["audit_event_id"], str)
    assert len(body["audit_event_id"]) > 0

    assert audit_path.exists()
    lines = audit_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    event = json.loads(lines[0])

    for field in ["audit_event_id", "event_type", "created_at", "policy_version", "decision_context", "input_snapshot", "output_snapshot"]:
        assert field in event

    assert event["audit_event_id"] == body["audit_event_id"]
    assert event["event_type"] == "borrow_better_quick_check"

    flattened = json.dumps(event).lower()
    for prohibited in PROHIBITED_FIELDS:
        assert f'"{prohibited}"' not in flattened


def test_borrow_better_quick_check_appends_multiple_audit_events(monkeypatch, tmp_path):
    audit_path = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_path))

    payload = {
        "declared_monthly_income": 100000,
        "existing_monthly_emi": 20000,
        "requested_loan_amount": 500000,
        "requested_tenor_months": 36,
        "indicative_interest_rate_pa": 0.14,
        "monthly_non_emi_commitments": 15000,
        "income_verified": False
    }
    client.post("/v1/borrow-better/quick-check", json=payload)
    client.post("/v1/borrow-better/quick-check", json=payload)

    lines = audit_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 2


def test_comfortable_borrowing_check_preferred_endpoint(monkeypatch, tmp_path):
    audit_path = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_path))

    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "monthly_income": 100000,
        "existing_monthly_commitments": 25000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36
    })
    assert response.status_code == 200
    body = response.json()

    for field in [
        "policy_version",
        "estimated_new_monthly_commitment",
        "total_monthly_commitment",
        "commitment_ratio",
        "comfort_status",
        "reason_codes",
        "next_best_action",
        "guidance_disclaimer",
        "audit_event_id",
    ]:
        assert field in body

    assert isinstance(body["audit_event_id"], str)
    assert len(body["audit_event_id"]) > 0

    lines = audit_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event["event_type"] == "comfortable_borrowing_check"
    assert event["audit_event_id"] == body["audit_event_id"]

    flattened = json.dumps(event).lower()
    for prohibited in PROHIBITED_FIELDS:
        assert f'"{prohibited}"' not in flattened


def test_comfortable_borrowing_check_caution_includes_commitment_ratio_reason_code(monkeypatch, tmp_path):
    audit_path = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_path))

    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "monthly_income": 100000,
        "existing_monthly_commitments": 25000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36
    })
    assert response.status_code == 200
    body = response.json()

    assert body["comfort_status"] == "CAUTION"
    assert "COMMITMENT_RATIO_CAUTION" in body["reason_codes"]
    assert len(body["reason_codes"]) > 1


def test_comfortable_borrowing_check_can_return_ok_when_income_verified():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "monthly_income": 200000,
        "existing_monthly_commitments": 10000,
        "desired_borrowing_amount": 100000,
        "desired_tenure_months": 60,
        "income_verified": True,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["comfort_status"] == "OK"
    assert body["reason_codes"] == []


def test_comfortable_borrowing_check_unverified_income_is_caution():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "monthly_income": 200000,
        "existing_monthly_commitments": 10000,
        "desired_borrowing_amount": 100000,
        "desired_tenure_months": 60,
        "income_verified": False,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["comfort_status"] == "CAUTION"
    assert "INCOME_UNVERIFIED" in body["reason_codes"]


def test_money_value_quick_check():
    response = client.post("/v1/money-value/quick-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 3000,
        "reward_rate_percent": 1.5,
        "revolving_balance": 0,
        "unused_subscription_cost_monthly": 500
    })
    assert response.status_code == 200
    assert "estimated_net_value" in response.json()


def test_legacy_money_value_uses_canonical_core_calculation():
    payload = {
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "reward_rate_percent": 1.5,
        "revolving_balance": 100000,
        "revolving_interest_rate_pa": 0.36,
        "unused_subscription_cost_monthly": 0,
    }
    legacy = client.post("/v1/money-value/quick-check", json=payload)
    preferred = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": payload["monthly_card_spend"],
        "annual_card_fee": payload["annual_card_fee"],
        "estimated_reward_rate_percent": payload["reward_rate_percent"],
        "revolving_balance": payload["revolving_balance"],
        "annual_interest_rate_percent": 36,
    })
    assert legacy.status_code == 200
    assert preferred.status_code == 200
    assert legacy.json()["estimated_annual_rewards"] == preferred.json()["estimated_annual_rewards"]
    assert legacy.json()["estimated_annual_interest_cost"] == preferred.json()["estimated_annual_interest_cost"]
    assert legacy.json()["estimated_net_value"] == preferred.json()["estimated_net_annual_value"]


def test_default_generated_logs_use_runtime_path(monkeypatch):
    monkeypatch.delenv("AUDIT_LOG_PATH", raising=False)
    monkeypatch.delenv("PRODUCT_EVENT_LOG_PATH", raising=False)
    repo_root = Path(__file__).resolve().parents[2]
    for path in (
        repo_root / "audit_events.jsonl",
        repo_root / "product_events.jsonl",
        repo_root / "services" / "api" / "audit_events.jsonl",
    ):
        assert not path.exists()

    audit_response = client.post("/v1/borrow-better/quick-check", json={
        "declared_monthly_income": 100000,
        "existing_monthly_emi": 20000,
        "requested_loan_amount": 500000,
        "requested_tenor_months": 36,
    })
    event_response = client.post("/v1/events", json={
        "event_type": "check_started",
        "journey": "money_value",
    })
    assert audit_response.status_code == 200
    assert event_response.status_code == 200
    assert not (repo_root / "audit_events.jsonl").exists()
    assert not (repo_root / "product_events.jsonl").exists()
    assert not (repo_root / "services" / "api" / "audit_events.jsonl").exists()


def test_money_value_check_positive():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "estimated_reward_rate_percent": 1.5,
        "revolving_balance": 0,
        "annual_interest_rate_percent": 36,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["policy_version"] == "alpha50-money-value-v0.1"
    assert body["annual_spend"] == 600000
    assert body["estimated_annual_rewards"] == 9000
    assert body["estimated_annual_interest_cost"] == 0
    assert body["estimated_net_annual_value"] == 5000
    assert body["value_status"] == "POSITIVE"
    assert "NET_VALUE_POSITIVE" in body["reason_codes"]
    assert body["audit_event_id"]
    assert body["audit_event"]["event_type"] == "money_value_check"


def test_money_value_check_neutral():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 9000,
        "estimated_reward_rate_percent": 1.5,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_net_annual_value"] == 0
    assert body["value_status"] == "NEUTRAL"
    assert "NET_VALUE_NEUTRAL" in body["reason_codes"]


def test_money_value_check_value_leakage():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 10000,
        "annual_card_fee": 5000,
        "estimated_reward_rate_percent": 1.0,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_net_annual_value"] < -1000
    assert body["value_status"] == "VALUE_LEAKAGE"
    assert "NET_VALUE_NEGATIVE" in body["reason_codes"]
    assert "ANNUAL_FEE_DRAG" in body["reason_codes"]


def test_money_value_check_revolving_interest_drag():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "estimated_reward_rate_percent": 1.5,
        "revolving_balance": 100000,
        "annual_interest_rate_percent": 36,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_annual_interest_cost"] == 36000
    assert "REVOLVING_INTEREST_DRAG" in body["reason_codes"]
    assert body["value_status"] == "VALUE_LEAKAGE"


def test_money_value_check_invalid_input():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": -100,
        "annual_card_fee": 4000,
        "estimated_reward_rate_percent": 1.5,
    })
    assert response.status_code == 422

    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": -4000,
        "estimated_reward_rate_percent": 1.5,
    })
    assert response.status_code == 422


def test_money_value_check_audit_persistence(tmp_path, monkeypatch):
    audit_file = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_file))
    payload = {
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "estimated_reward_rate_percent": 1.5,
        "revolving_balance": 0,
        "annual_interest_rate_percent": 36,
    }

    response = client.post("/v1/financial-intelligence/money-value-check", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["audit_event_id"]

    lines = audit_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event["audit_event_id"] == body["audit_event_id"]
    assert event["event_type"] == "money_value_check"
    assert event["policy_version"] == "alpha50-money-value-v0.1"
    assert event["decision_context"] == "local_demo"
    assert event["created_at"]
    assert event["event_time_utc"]
    assert event["input_snapshot"] == payload
    assert event["output_snapshot"]["value_status"] == "POSITIVE"
    for prohibited in PROHIBITED_FIELDS:
        assert f'"{prohibited}"' not in json.dumps(event).lower()


def test_financial_intelligence_money_value_check_preferred_route():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 3000,
        "estimated_reward_rate_percent": 1.5,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["policy_version"] == "alpha50-money-value-v0.1"
    assert "estimated_net_annual_value" in body
    assert "audit_event_id" in body


def test_record_product_event(tmp_path, monkeypatch):
    event_file = tmp_path / "product_events.jsonl"
    monkeypatch.setenv("PRODUCT_EVENT_LOG_PATH", str(event_file))
    response = client.post("/v1/events", json={
        "event_type": "door_selected",
        "journey": "money_value",
        "decision_context": "local_demo",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["event_type"] == "door_selected"
    assert body["journey"] == "money_value"
    assert body["event_id"]
    assert body["created_at"]

    event = json.loads(event_file.read_text(encoding="utf-8").strip())
    assert event == body
    serialized = json.dumps(event).lower()
    for prohibited in PROHIBITED_FIELDS + ["monthly_card_spend", "annual_card_fee", "income", "loan"]:
        assert prohibited not in serialized


def test_record_product_event_rejects_unknown_event_type():
    response = client.post("/v1/events", json={
        "event_type": "not_a_real_event",
        "journey": "money_value",
        "decision_context": "local_demo",
    })
    assert response.status_code == 422
