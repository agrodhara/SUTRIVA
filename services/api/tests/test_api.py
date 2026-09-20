import json
import os
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from app.main import app
from app.services.anonymous_sessions import get_cookie_name
from app.services.audit import record_audit_event
from conftest import phaseb_origin

client = TestClient(app)

PROHIBITED_FIELDS = ["name", "email", "phone", "pan", "aadhaar", "account_number", "card_number"]
MONEY_SENTINELS = ["54321.98", "4321.09", "987.65", "654.32", "321.45", "111.22", "19.75"]
BORROW_SENTINELS = ["98765.43", "21098.76", "543210.98", "13.37", "4321.55"]


def product_event_payload(**overrides):
    payload = {
        "event_id": "evt-123",
        "event_type": "door_selected",
        "journey_run_id": "run-123",
        "journey": "money_value",
        "card_check_number": 1,
        "version": "track-1.1a-prototype-2026-09-17",
        "timestamp": "2026-09-17T00:00:00Z",
        "decision_context": "local_demo",
    }
    payload.update(overrides)
    if payload.get("journey") != "money_value":
        payload.pop("card_check_number", None)
    return payload


def _bootstrap_event_cookie(phaseb_client: TestClient) -> dict[str, str]:
    response = phaseb_client.post("/v1/anonymous-sessions/bootstrap", headers={"Origin": phaseb_origin()})
    assert response.status_code == 200
    cookie_name = get_cookie_name()
    return {cookie_name: response.cookies.get(cookie_name)}


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
        "existing_debt_payments": 25000,
        "housing_rent": 20000,
        "household_utilities": 5000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 1000,
        "other_essential_commitments": 1000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36
    })
    assert response.status_code == 200
    body = response.json()

    for field in [
        "policy_version",
        "illustrative_annual_rate_percent",
        "estimated_new_monthly_commitment",
        "total_monthly_commitment",
        "commitment_ratio",
        "debt_ratio_before",
        "debt_ratio_after",
        "committed_ratio_before",
        "committed_ratio_after",
        "breathing_room_before",
        "breathing_room_after",
        "total_repayment",
        "total_interest",
        "comfort_status",
        "reason_codes",
        "next_best_action",
        "guidance_disclaimer",
        "audit_event_id",
    ]:
        assert field in body

    assert isinstance(body["audit_event_id"], str)
    assert len(body["audit_event_id"]) > 0
    assert body["illustrative_annual_rate_percent"] == 14

    lines = audit_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1
    event = json.loads(lines[0])
    assert event["event_type"] == "comfortable_borrowing_check"
    assert event["audit_event_id"] == body["audit_event_id"]

    flattened = json.dumps(event).lower()
    for prohibited in PROHIBITED_FIELDS:
        assert f'"{prohibited}"' not in flattened


def test_comfortable_borrowing_commitment_ratio_includes_existing_and_proposed_emi():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 100000,
        "existing_debt_payments": 25000,
        "housing_rent": 20000,
        "household_utilities": 5000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 1000,
        "other_essential_commitments": 1000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
    })
    assert response.status_code == 200
    body = response.json()

    assert body["estimated_new_monthly_commitment"] > 0
    expected_ratio = body["total_monthly_commitment"] / 100000
    assert abs(body["commitment_ratio"] - round(expected_ratio, 4)) <= 0.0001
    assert body["debt_ratio_before"] == 0.25
    assert body["debt_ratio_after"] > body["debt_ratio_before"]
    assert body["committed_ratio_before"] == 0.55
    assert body["committed_ratio_after"] == body["commitment_ratio"]
    assert body["breathing_room_before"] == 45000
    assert body["breathing_room_after"] == round(100000 - body["total_monthly_commitment"], 2)
    assert body["total_repayment"] > 500000
    assert body["total_interest"] > 0


def test_comfortable_borrowing_legacy_mode_uses_single_commitment_field():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "legacy_total_commitments",
        "monthly_income": 100000,
        "existing_monthly_commitments": 25000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
    })
    assert response.status_code == 200
    body = response.json()

    assert body["non_debt_commitments"] == 0
    assert body["debt_ratio_before"] == 0.25
    assert body["committed_ratio_before"] == 0.25
    assert body["commitment_ratio"] == round(body["total_monthly_commitment"] / 100000, 4)


def test_comfortable_borrowing_track_mode_rejects_incomplete_grouped_commitments():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 100000,
        "existing_debt_payments": 25000,
        "housing_rent": 20000,
        "household_utilities": 5000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 1000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
    })
    assert response.status_code == 422


def test_comfortable_borrowing_rejects_mixed_legacy_and_track_fields():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "legacy_total_commitments",
        "monthly_income": 100000,
        "existing_monthly_commitments": 25000,
        "existing_debt_payments": 25000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
    })
    assert response.status_code == 422


def test_comfortable_borrowing_check_caution_includes_commitment_ratio_reason_code(monkeypatch, tmp_path):
    audit_path = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_path))

    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 100000,
        "existing_debt_payments": 25000,
        "housing_rent": 20000,
        "household_utilities": 5000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 1000,
        "other_essential_commitments": 1000,
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
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 200000,
        "existing_debt_payments": 10000,
        "housing_rent": 20000,
        "household_utilities": 4000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 2000,
        "other_essential_commitments": 1000,
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
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 200000,
        "existing_debt_payments": 10000,
        "housing_rent": 20000,
        "household_utilities": 4000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 2000,
        "other_essential_commitments": 1000,
        "desired_borrowing_amount": 100000,
        "desired_tenure_months": 60,
        "income_verified": False,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["comfort_status"] == "CAUTION"
    assert "INCOME_UNVERIFIED" in body["reason_codes"]


def test_comfortable_borrowing_zero_rate_is_preserved_and_interest_is_zero():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 100000,
        "existing_debt_payments": 20000,
        "housing_rent": 20000,
        "household_utilities": 4000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 2000,
        "other_essential_commitments": 1000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
        "illustrative_annual_rate_percent": 0,
    })
    assert response.status_code == 200
    body = response.json()

    assert body["illustrative_annual_rate_percent"] == 0
    assert round(body["estimated_new_monthly_commitment"], 2) == round(500000 / 36, 2)
    assert abs(body["total_interest"]) <= 0.01


def test_comfortable_borrowing_omitted_rate_uses_configured_default():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 100000,
        "existing_debt_payments": 20000,
        "housing_rent": 20000,
        "household_utilities": 4000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 2000,
        "other_essential_commitments": 1000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
    })
    assert response.status_code == 200
    assert response.json()["illustrative_annual_rate_percent"] == 14


def test_comfortable_borrowing_non_default_rate_reaches_downstream_calculation():
    base_payload = {
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 100000,
        "existing_debt_payments": 20000,
        "housing_rent": 20000,
        "household_utilities": 4000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 2000,
        "other_essential_commitments": 1000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
    }
    low = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={**base_payload, "illustrative_annual_rate_percent": 10})
    high = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={**base_payload, "illustrative_annual_rate_percent": 18})

    assert low.status_code == 200
    assert high.status_code == 200
    low_body = low.json()
    high_body = high.json()

    assert low_body["illustrative_annual_rate_percent"] == 10
    assert high_body["illustrative_annual_rate_percent"] == 18
    assert high_body["estimated_new_monthly_commitment"] > low_body["estimated_new_monthly_commitment"]
    assert high_body["total_interest"] > low_body["total_interest"]


def test_comfortable_borrowing_debt_vs_committed_ratio_fixture():
    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 100000,
        "existing_debt_payments": 20000,
        "housing_rent": 20000,
        "household_utilities": 4000,
        "dependants_education": 3000,
        "recurring_medical_insurance": 2000,
        "other_essential_commitments": 1000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
        "illustrative_annual_rate_percent": 15,
    })
    assert response.status_code == 200
    body = response.json()

    emi = body["estimated_new_monthly_commitment"]
    assert body["debt_ratio_before"] == 0.2
    assert body["debt_ratio_after"] == round((20000 + emi) / 100000, 4)
    assert body["committed_ratio_before"] == 0.5
    assert body["committed_ratio_after"] == round((50000 + emi) / 100000, 4)
    assert body["breathing_room_before"] == 50000
    assert body["breathing_room_after"] == round(50000 - emi, 2)
    assert abs(body["total_repayment"] - round(emi * 36, 2)) <= 0.2
    assert body["total_interest"] == round(body["total_repayment"] - 500000, 2)


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


def test_default_generated_logs_use_runtime_path(monkeypatch, phaseb_client):
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
    event_response = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies=_bootstrap_event_cookie(phaseb_client),
        json=product_event_payload(event_type="check_started"),
    )
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
    assert body["reward_value_known"] is True
    assert body["reward_input_basis"] == "rate_percent"
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
    assert body["reward_value_known"] is True
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


def test_money_value_check_valid_negative_net_value_with_non_negative_inputs():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 15000,
        "annual_card_fee": 6000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 100,
        "reward_period": "monthly",
        "revolving_balance": 50000,
        "annual_interest_rate_percent": 24,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_net_annual_value"] is not None
    assert body["estimated_net_annual_value"] < 0
    assert body["value_status"] == "VALUE_LEAKAGE"


def test_money_value_check_cashback_amount_monthly():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 3000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 500,
        "reward_period": "monthly",
        "revolving_balance": 0,
        "annual_interest_rate_percent": 0,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_annual_rewards"] == 6000
    assert body["estimated_net_annual_value"] == 3000
    assert body["reward_input_basis"] == "cashback_amount"
    assert body["reward_period"] == "monthly"
    assert body["reward_value_known"] is True


def test_money_value_check_cashback_amount_yearly():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 3000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 7200,
        "reward_period": "yearly",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_annual_rewards"] == 7200
    assert body["estimated_net_annual_value"] == 4200
    assert body["reward_period"] == "yearly"


def test_money_value_check_cashback_amount_quarterly():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 3000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 1500,
        "reward_period": "quarterly",
        "interest_input_basis": "no_balance",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_annual_rewards"] == 6000
    assert body["estimated_net_annual_value"] == 3000
    assert body["reward_period"] == "quarterly"


def test_money_value_check_points_known_reward_value_monthly():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_input_basis": "known_reward_value",
        "reward_value_amount": 500,
        "reward_period": "monthly",
        "interest_input_basis": "no_balance",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_annual_rewards"] == 6000
    assert body["estimated_net_annual_value"] == 2000
    assert body["reward_value_known"] is True
    assert body["reward_input_basis"] == "known_reward_value"


def test_money_value_check_miles_known_reward_value_yearly():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "miles",
        "reward_input_basis": "known_reward_value",
        "reward_value_amount": 12000,
        "reward_period": "yearly",
        "interest_input_basis": "no_balance",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_annual_rewards"] == 12000
    assert body["estimated_net_annual_value"] == 8000
    assert body["reward_value_known"] is True
    assert body["reward_period"] == "yearly"


def test_money_value_check_points_unknown_value_not_zeroed():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_value_unknown": True,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["reward_value_known"] is False
    assert body["estimated_annual_rewards"] is None
    assert body["estimated_net_annual_value"] is None
    assert body["value_status"] == "UNKNOWN_VALUE"


def test_money_value_check_unknown_reward_value_not_zeroed():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "miles",
        "reward_value_unknown": True,
        "revolving_balance": 50000,
        "annual_interest_rate_percent": 24,
    })
    assert response.status_code == 200
    body = response.json()
    assert body["reward_value_known"] is False
    assert body["estimated_annual_rewards"] is None
    assert body["estimated_net_annual_value"] is None
    assert body["annualized_reward_units"] is None
    assert body["value_status"] == "UNKNOWN_VALUE"
    assert "REWARD_VALUE_UNKNOWN" in body["reason_codes"]
    assert "REVOLVING_INTEREST_DRAG" in body["reason_codes"]


def test_money_value_check_points_unknown_conversion_shows_annualized_units_only():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_input_basis": "earned_units",
        "reward_units_earned": 1000,
        "reward_period": "quarterly",
        "reward_value_unknown": True,
        "interest_input_basis": "no_balance",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["annualized_reward_units"] == 4000
    assert body["estimated_annual_rewards"] is None
    assert body["estimated_net_annual_value"] is None
    assert body["reward_value_known"] is False
    assert body["value_status"] == "UNKNOWN_VALUE"


def test_money_value_check_not_sure_reward_type_is_unknown_value_path():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "not_sure",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["reward_value_known"] is False
    assert body["estimated_annual_rewards"] is None
    assert body["value_status"] == "UNKNOWN_VALUE"


def test_money_value_check_not_sure_rejects_numeric_reward_fields():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "not_sure",
        "reward_input_basis": "earned_units",
        "reward_units_earned": 1200,
        "reward_period": "monthly",
    })
    assert response.status_code == 422


def test_money_value_check_blank_amount_vs_explicit_zero_for_known_reward_value():
    missing_amount = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_input_basis": "known_reward_value",
        "reward_period": "monthly",
        "interest_input_basis": "no_balance",
    })
    assert missing_amount.status_code == 422

    explicit_zero = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_input_basis": "known_reward_value",
        "reward_value_amount": 0,
        "reward_period": "monthly",
        "interest_input_basis": "no_balance",
    })
    assert explicit_zero.status_code == 200
    body = explicit_zero.json()
    assert body["estimated_annual_rewards"] == 0
    assert body["reward_value_known"] is True


def test_money_value_check_unknown_interest_vs_no_balance():
    unknown_interest = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 900,
        "reward_period": "monthly",
        "interest_input_basis": "unknown",
        "interest_value_unknown": True,
    })
    assert unknown_interest.status_code == 200
    unknown_body = unknown_interest.json()
    assert unknown_body["estimated_annual_rewards"] == 10800
    assert unknown_body["estimated_annual_interest_cost"] is None
    assert unknown_body["estimated_net_annual_value"] is None
    assert unknown_body["value_status"] == "UNKNOWN_VALUE"
    assert "INTEREST_VALUE_UNKNOWN" in unknown_body["reason_codes"]

    no_balance = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 900,
        "reward_period": "monthly",
        "interest_input_basis": "no_balance",
    })
    assert no_balance.status_code == 200
    no_balance_body = no_balance.json()
    assert no_balance_body["estimated_annual_interest_cost"] == 0
    assert no_balance_body["interest_value_known"] is True
    assert no_balance_body["estimated_net_annual_value"] == 6800


def test_money_value_check_monthly_yearly_annualization_for_known_reward_value():
    monthly = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_input_basis": "known_reward_value",
        "reward_value_amount": 500,
        "reward_period": "monthly",
        "interest_input_basis": "no_balance",
    })
    yearly = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_input_basis": "known_reward_value",
        "reward_value_amount": 6000,
        "reward_period": "yearly",
        "interest_input_basis": "no_balance",
    })
    assert monthly.status_code == 200
    assert yearly.status_code == 200
    assert monthly.json()["estimated_annual_rewards"] == yearly.json()["estimated_annual_rewards"] == 6000


def test_money_value_check_fixed_reward_amount_unaffected_by_spend_change():
    low_spend = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 10000,
        "annual_card_fee": 4000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 900,
        "reward_period": "monthly",
        "interest_input_basis": "no_balance",
    })
    high_spend = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 200000,
        "annual_card_fee": 4000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 900,
        "reward_period": "monthly",
        "interest_input_basis": "no_balance",
    })
    assert low_spend.status_code == 200
    assert high_spend.status_code == 200
    assert low_spend.json()["estimated_annual_rewards"] == high_spend.json()["estimated_annual_rewards"] == 10800


def test_money_value_check_legacy_earned_units_compatibility():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 60000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_input_basis": "earned_units",
        "reward_units_earned": 1000,
        "reward_period": "monthly",
        "rupee_value_per_reward_unit": 0.5,
        "interest_input_basis": "no_balance",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["estimated_annual_rewards"] == 6000
    assert body["reward_input_basis"] == "earned_units"


def test_money_value_check_rejects_incompatible_fields_after_reward_type_switch():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 3000,
        "reward_type": "miles",
        "reward_input_basis": "known_reward_value",
        "reward_value_amount": 3000,
        "reward_period": "monthly",
        "cashback_amount": 500,
        "interest_input_basis": "no_balance",
    })
    assert response.status_code == 422


def test_money_value_check_rejects_invalid_mixed_reward_fields():
    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 3000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 500,
        "reward_period": "monthly",
        "estimated_reward_rate_percent": 1.5,
    })
    assert response.status_code == 422

    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 3000,
        "reward_type": "points",
        "reward_input_basis": "earned_units",
        "reward_units_earned": 1000,
        "reward_period": "monthly",
    })
    assert response.status_code == 422


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

    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": -1,
        "reward_period": "monthly",
    })
    assert response.status_code == 422

    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "reward_type": "points",
        "reward_input_basis": "earned_units",
        "reward_units_earned": -10,
        "reward_period": "monthly",
        "rupee_value_per_reward_unit": 0.5,
    })
    assert response.status_code == 422

    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 50000,
        "annual_card_fee": 4000,
        "estimated_reward_rate_percent": 1.5,
        "revolving_balance": -100,
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
    assert event["audit_schema_version"] == "audit-redacted-v1"
    assert event["input_snapshot"]["journey"] == "money_value"
    assert event["input_snapshot"]["request_kind"] == "preferred_public_route"
    assert event["input_snapshot"]["reward_type"] == "cashback"
    assert event["input_snapshot"]["declared_fields"]["spend"] is True
    assert event["output_snapshot"]["value_status"] == "POSITIVE"
    assert event["output_snapshot"]["reason_codes"]
    for prohibited in PROHIBITED_FIELDS:
        assert f'"{prohibited}"' not in json.dumps(event).lower()


def test_money_value_check_redacts_raw_values_for_legacy_and_enhanced_audit(monkeypatch, tmp_path):
    audit_file = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_file))

    legacy_payload = {
        "monthly_card_spend": 54321.98,
        "annual_card_fee": 4321.09,
        "reward_rate_percent": 1.82,
        "revolving_balance": 987.65,
        "revolving_interest_rate_pa": 0.4132,
        "unused_subscription_cost_monthly": 321.45,
    }
    enhanced_payload = {
        "monthly_card_spend": 65432.19,
        "annual_card_fee": 3210.45,
        "reward_type": "points",
        "reward_input_basis": "earned_units",
        "reward_units_earned": 111.22,
        "reward_period": "monthly",
        "rupee_value_per_reward_unit": 19.75,
        "interest_input_basis": "known",
        "revolving_balance": 654.32,
        "annual_interest_rate_percent": 28.4,
    }

    legacy_response = client.post("/v1/money-value/quick-check", json=legacy_payload)
    enhanced_response = client.post("/v1/financial-intelligence/money-value-check", json=enhanced_payload)

    assert legacy_response.status_code == 200
    assert enhanced_response.status_code == 200

    records = [json.loads(line) for line in audit_file.read_text(encoding="utf-8").strip().splitlines()]
    assert len(records) == 2

    legacy_event, enhanced_event = records
    serialized = json.dumps(records)
    for sentinel in MONEY_SENTINELS:
        assert sentinel not in serialized

    enhanced_body = enhanced_response.json()
    for field in ["estimated_annual_rewards", "estimated_annual_interest_cost", "estimated_net_annual_value", "annual_spend"]:
        assert json.dumps(enhanced_body[field]) not in serialized

    assert legacy_event["output_snapshot"]["result_state"] in {"flags_present", "no_flags"}
    assert enhanced_event["input_snapshot"]["rewards_mode"] == "earned_units"
    assert enhanced_event["output_snapshot"]["value_status"] == enhanced_body["value_status"]
    assert enhanced_event["output_snapshot"]["reason_codes"] == enhanced_body["reason_codes"]


def test_money_value_check_validation_failure_does_not_persist_raw_audit(monkeypatch, tmp_path):
    audit_file = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_file))

    response = client.post("/v1/financial-intelligence/money-value-check", json={
        "monthly_card_spend": 54321.98,
        "annual_card_fee": 4321.09,
        "reward_type": "points",
        "reward_input_basis": "earned_units",
        "reward_units_earned": -111.22,
        "reward_period": "monthly",
        "rupee_value_per_reward_unit": 19.75,
    })

    assert response.status_code == 422
    assert not audit_file.exists() or audit_file.read_text(encoding="utf-8") == ""


def test_comfortable_borrowing_audit_redacts_raw_values_for_legacy_and_track11a(monkeypatch, tmp_path):
    audit_file = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_file))

    legacy_response = client.post("/v1/borrow-better/quick-check", json={
        "declared_monthly_income": 98765.43,
        "existing_monthly_emi": 21098.76,
        "requested_loan_amount": 543210.98,
        "requested_tenor_months": 47,
        "indicative_interest_rate_pa": 0.1337,
        "monthly_non_emi_commitments": 4321.55,
        "income_verified": True,
    })
    grouped_response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 98765.43,
        "existing_debt_payments": 21098.76,
        "housing_rent": 10001.11,
        "household_utilities": 2002.22,
        "dependants_education": 3003.33,
        "recurring_medical_insurance": 4004.44,
        "other_essential_commitments": 5005.55,
        "desired_borrowing_amount": 543210.98,
        "desired_tenure_months": 47,
        "illustrative_annual_rate_percent": 13.37,
        "income_verified": True,
    })

    assert legacy_response.status_code == 200
    assert grouped_response.status_code == 200

    records = [json.loads(line) for line in audit_file.read_text(encoding="utf-8").strip().splitlines()]
    assert len(records) == 2

    serialized = json.dumps(records)
    for sentinel in BORROW_SENTINELS + ["10001.11", "2002.22", "3003.33", "4004.44", "5005.55"]:
        assert sentinel not in serialized
    for forbidden_key in [
        "declared_monthly_income",
        "monthly_income",
        "existing_monthly_emi",
        "existing_debt_payments",
        "requested_loan_amount",
        "desired_borrowing_amount",
        "estimated_new_monthly_commitment",
        "total_monthly_commitment",
        "total_repayment",
        "total_interest",
    ]:
        assert f'"{forbidden_key}"' not in serialized

    grouped_body = grouped_response.json()
    for field in [
        "estimated_new_monthly_commitment",
        "total_monthly_commitment",
        "commitment_ratio",
        "debt_ratio_before",
        "debt_ratio_after",
        "breathing_room_before",
        "breathing_room_after",
        "total_repayment",
        "total_interest",
    ]:
        assert json.dumps(grouped_body[field]) not in serialized

    assert records[0]["output_snapshot"]["decision"] == legacy_response.json()["decision"]
    assert records[1]["input_snapshot"]["calculation_mode"] == "track_11a_breakdown"
    assert records[1]["output_snapshot"]["comfort_status"] == grouped_body["comfort_status"]


def test_comfortable_borrowing_validation_failure_does_not_persist_raw_audit(monkeypatch, tmp_path):
    audit_file = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_file))

    response = client.post("/v1/borrowing-intelligence/comfortable-borrowing-check", json={
        "calculation_mode": "track_11a_breakdown",
        "monthly_income": 98765.43,
        "existing_debt_payments": 21098.76,
        "housing_rent": 10001.11,
        "household_utilities": 2002.22,
        "dependants_education": 3003.33,
        "recurring_medical_insurance": 4004.44,
        "desired_borrowing_amount": 543210.98,
        "desired_tenure_months": 47,
    })

    assert response.status_code == 422
    assert not audit_file.exists() or audit_file.read_text(encoding="utf-8") == ""


def test_record_audit_event_redacts_unknown_future_snapshot_keys(monkeypatch, tmp_path):
    audit_file = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_file))

    record = record_audit_event(
        event_type="future_event",
        policy_version="v-test",
        input_snapshot={
            "monthly_income": 98765.43,
            "mobile_number": "9999999999",
            "arbitrary_key": "should-not-pass",
        },
        output_snapshot={
            "estimated_net_annual_value": 54321.98,
            "reason_codes": ["NOT_SAFE"],
            "arbitrary_key": "should-not-pass",
        },
    )

    stored = json.loads(audit_file.read_text(encoding="utf-8").strip())
    assert stored == record
    assert stored["input_snapshot"] == {
        "schema_version": "audit-redacted-v1",
        "journey": "unknown",
        "endpoint": "unknown",
    }
    assert stored["output_snapshot"] == {
        "schema_version": "audit-redacted-v1",
        "journey": "unknown",
        "endpoint": "unknown",
        "request_status": "succeeded",
    }
    serialized = json.dumps(stored)
    assert "98765.43" not in serialized
    assert "54321.98" not in serialized
    assert "9999999999" not in serialized
    assert "should-not-pass" not in serialized


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


def test_record_product_event(phaseb_client, phaseb_upgraded_database: str):
    response = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies=_bootstrap_event_cookie(phaseb_client),
        json=product_event_payload(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "persisted"
    assert body["event_type"] == "door_selected"
    assert body["journey"] == "money_value"
    assert body["event_id"] == "evt-123"
    assert body["journey_run_id"] == "run-123"
    assert body["version"] == "track-1.1a-prototype-2026-09-17"
    assert body["timestamp"] == "2026-09-17T00:00:00Z"
    assert body["received_at"]

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        event = conn.execute(text("SELECT event_id, event_type, journey FROM product_events")).mappings().one()
    serialized = json.dumps(dict(event)).lower()
    for prohibited in PROHIBITED_FIELDS + ["monthly_card_spend", "annual_card_fee", "income", "loan"]:
        assert prohibited not in serialized


def test_record_product_event_rejects_unknown_event_type(phaseb_client):
    response = phaseb_client.post(
        "/v1/events",
        headers={"Origin": phaseb_origin()},
        cookies=_bootstrap_event_cookie(phaseb_client),
        json=product_event_payload(event_type="not_a_real_event"),
    )
    assert response.status_code == 422


def test_record_product_event_accepts_new_track_11_fields(phaseb_client, phaseb_upgraded_database: str):
    response = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=_bootstrap_event_cookie(phaseb_client), json=product_event_payload(
        event_id="evt-next",
        event_type="next_interest_selected",
        journey="comfortable_borrowing",
        journey_run_id="run-borrow",
        intent="actual_obligations",
    ))
    assert response.status_code == 200
    body = response.json()
    assert body["intent"] == "actual_obligations"
    assert body["reason"] is None

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        record = conn.execute(text("SELECT intent, reason FROM continuation_intents")).mappings().one()
    assert record["intent"] == "actual_obligations"
    assert record["reason"] is None


def test_record_product_event_validates_track_11_payload_combinations(phaseb_client):
    cookies = _bootstrap_event_cookie(phaseb_client)

    accepted = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookies, json=product_event_payload(
        event_id="evt-decline",
        event_type="decline_reason_selected",
        intent="actual_card_value",
        reason="statement_sharing_declined",
    ))
    assert accepted.status_code == 200

    invalid_intent = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookies, json=product_event_payload(
        event_id="evt-invalid-intent",
        event_type="next_interest_selected",
        reason="not_useful",
    ))
    assert invalid_intent.status_code == 422

    invalid_reason = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookies, json=product_event_payload(
        event_id="evt-invalid-reason",
        event_type="decline_reason_selected",
        journey="comfortable_borrowing",
        intent="actual_obligations",
    ))
    assert invalid_reason.status_code == 422

    wrong_journey_intent = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookies, json=product_event_payload(
        event_id="evt-wrong-journey",
        event_type="next_interest_selected",
        journey="comfortable_borrowing",
        intent="actual_card_value",
    ))
    assert wrong_journey_intent.status_code == 422


def test_record_product_event_preserves_legacy_go_deeper_compatibility(phaseb_client):
    response = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=_bootstrap_event_cookie(phaseb_client), json=product_event_payload(
        event_id="evt-go-deeper",
        event_type="go_deeper_selected",
    ))
    assert response.status_code == 200
    body = response.json()
    assert body["decision_context"] == "local_demo"
    assert body["intent"] is None
    assert body["reason"] is None


def test_record_product_event_rejects_card_check_number_for_borrow_journey(phaseb_client):
    payload = product_event_payload(journey="comfortable_borrowing")
    payload["card_check_number"] = 2
    response = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=_bootstrap_event_cookie(phaseb_client), json=payload)
    assert response.status_code == 422


def test_record_product_event_idempotent_event_id(phaseb_client, phaseb_upgraded_database: str):
    payload = product_event_payload(event_id="evt-same")
    cookies = _bootstrap_event_cookie(phaseb_client)
    first = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookies, json=payload)
    second = phaseb_client.post("/v1/events", headers={"Origin": phaseb_origin()}, cookies=cookies, json=payload)

    assert first.status_code == 200
    assert second.status_code == 200

    engine = create_engine(phaseb_upgraded_database, future=True)
    with engine.connect() as conn:
        count = conn.execute(text("SELECT COUNT(*) FROM product_events WHERE event_id = 'evt-same'")) .scalar_one()
    assert count == 1
