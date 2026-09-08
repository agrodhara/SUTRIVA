import json

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

MONEY_VALUE_CHECK_URL = "/v1/financial-intelligence/money-value-check"
MONEY_VALUE_POLICY_VERSION = "alpha50-money-value-v0.1"


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


def test_money_value_check_positive():
    response = client.post(MONEY_VALUE_CHECK_URL, json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "estimated_reward_rate_percent": 1.5,
        "revolving_balance": 0,
        "annual_interest_rate_percent": 36
    })
    assert response.status_code == 200
    body = response.json()
    for key in (
        "policy_version",
        "annual_spend",
        "estimated_annual_rewards",
        "annual_card_fee",
        "estimated_annual_interest_cost",
        "estimated_net_annual_value",
        "value_status",
        "reason_codes",
        "next_best_action",
        "guidance_disclaimer",
        "audit_event_id",
        "audit_event",
    ):
        assert key in body
    assert body["policy_version"] == MONEY_VALUE_POLICY_VERSION
    assert body["annual_spend"] == 600000
    assert body["estimated_annual_rewards"] == 9000
    assert body["estimated_annual_interest_cost"] == 0
    assert body["estimated_net_annual_value"] == 5000
    assert body["value_status"] == "POSITIVE"
    assert "NET_VALUE_POSITIVE" in body["reason_codes"]
    assert body["audit_event_id"]
    assert body["audit_event"]["event_type"] == "money_value_check"
    assert body["audit_event"]["policy_version"] == MONEY_VALUE_POLICY_VERSION
    assert body["audit_event"]["decision_context"] == "local_demo"


def test_money_value_check_neutral():
    response = client.post(MONEY_VALUE_CHECK_URL, json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 9000,
        "estimated_reward_rate_percent": 1.5
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_net_annual_value"] == 0
    assert -1000 <= body["estimated_net_annual_value"] <= 1000
    assert body["value_status"] == "NEUTRAL"
    assert "NET_VALUE_NEUTRAL" in body["reason_codes"]


def test_money_value_check_value_leakage():
    response = client.post(MONEY_VALUE_CHECK_URL, json={
        "monthly_card_spend": 10000,
        "annual_card_fee": 5000,
        "estimated_reward_rate_percent": 1.0
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_net_annual_value"] < -1000
    assert body["value_status"] == "VALUE_LEAKAGE"
    assert "NET_VALUE_NEGATIVE" in body["reason_codes"]
    assert "ANNUAL_FEE_DRAG" in body["reason_codes"]


def test_money_value_check_revolving_interest_drag():
    response = client.post(MONEY_VALUE_CHECK_URL, json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "estimated_reward_rate_percent": 1.5,
        "revolving_balance": 100000,
        "annual_interest_rate_percent": 36
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_annual_interest_cost"] == 36000
    assert body["estimated_annual_interest_cost"] > 0
    assert "REVOLVING_INTEREST_DRAG" in body["reason_codes"]
    assert body["value_status"] == "VALUE_LEAKAGE"


def test_money_value_check_invalid_input():
    response = client.post(MONEY_VALUE_CHECK_URL, json={
        "monthly_card_spend": -100,
        "annual_card_fee": 4000,
        "estimated_reward_rate_percent": 1.5
    })
    assert response.status_code == 422
    response = client.post(MONEY_VALUE_CHECK_URL, json={
        "monthly_card_spend": 50000,
        "annual_card_fee": -4000,
        "estimated_reward_rate_percent": 1.5
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
        "annual_interest_rate_percent": 36
    }
    response = client.post(MONEY_VALUE_CHECK_URL, json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["audit_event_id"]

    lines = audit_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event["audit_event_id"] == body["audit_event_id"]
    assert event["event_type"] == "money_value_check"
    assert event["policy_version"] == MONEY_VALUE_POLICY_VERSION
    assert event["decision_context"] == "local_demo"
    assert event["created_at"]
    assert event["input_snapshot"] == payload
    assert event["output_snapshot"]["value_status"] == "POSITIVE"
    assert "NET_VALUE_POSITIVE" in event["output_snapshot"]["reason_codes"]

    prohibited_fields = (
        "name",
        "email",
        "phone",
        "pan",
        "card_number",
        "account_number",
        "issuer_account_id",
        "raw_transaction_data",
    )
    for field in prohibited_fields:
        assert field not in event
        assert field not in event["input_snapshot"]
        assert field not in event["output_snapshot"]
