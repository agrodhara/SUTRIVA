import json
import os
import tempfile

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
