from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


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


def comfortable_check_payload(**overrides):
    payload = {
        "monthly_income": 100000,
        "existing_monthly_commitments": 25000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
    }
    payload.update(overrides)
    return payload


def test_comfortable_borrowing_check_comfortable():
    response = client.post(
        "/v1/borrowing-intelligence/comfortable-borrowing-check",
        json=comfortable_check_payload(existing_monthly_commitments=0),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["comfort_status"] == "COMFORTABLE"
    assert body["reason_codes"] == ["COMMITMENT_RATIO_COMFORTABLE"]
    assert body["audit_event"]["event_type"] == "comfortable_borrowing_check"
    assert "guidance_disclaimer" in body


def test_comfortable_borrowing_check_caution():
    response = client.post(
        "/v1/borrowing-intelligence/comfortable-borrowing-check",
        json=comfortable_check_payload(),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["comfort_status"] == "CAUTION"
    assert "COMMITMENT_RATIO_CAUTION" in body["reason_codes"]


def test_comfortable_borrowing_check_stretched():
    response = client.post(
        "/v1/borrowing-intelligence/comfortable-borrowing-check",
        json=comfortable_check_payload(existing_monthly_commitments=60000),
    )
    assert response.status_code == 200
    body = response.json()
    assert body["comfort_status"] == "STRETCHED"
    assert "COMMITMENT_RATIO_STRETCHED" in body["reason_codes"]


def test_comfortable_borrowing_check_rejects_zero_income():
    response = client.post(
        "/v1/borrowing-intelligence/comfortable-borrowing-check",
        json=comfortable_check_payload(monthly_income=0),
    )
    assert response.status_code == 422
