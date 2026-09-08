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
