"""Rewards Intelligence 1.1A Steps 2-5 contract tests for POST /v1/financial-intelligence/money-value-check.

Covers the additive request fields (spending_priorities, balance_behavior), request hardening,
the bounded Step 4 result codes and audit redaction. None of these tests need a database.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app

ROUTE = "/v1/financial-intelligence/money-value-check"
client = TestClient(app)


@pytest.fixture(autouse=True)
def _isolated_audit_log(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIT_LOG_PATH", str(tmp_path / "audit_events.jsonl"))
    return tmp_path / "audit_events.jsonl"


def cashback_payload(**overrides):
    payload = {
        "monthly_card_spend": 25000,
        "annual_card_fee": 4000,
        "reward_type": "cashback",
        "reward_input_basis": "cashback_amount",
        "cashback_amount": 900,
        "reward_period": "monthly",
    }
    payload.update(overrides)
    return payload


def post(**overrides):
    return client.post(ROUTE, json=cashback_payload(**overrides))


# --- Backward compatibility --------------------------------------------------------------------


def test_old_payload_without_new_fields_is_unchanged():
    body = post(interest_input_basis="no_balance").json()

    assert body["estimated_annual_rewards"] == 10800
    assert body["annual_card_fee"] == 4000
    assert body["estimated_annual_interest_cost"] == 0
    assert body["estimated_net_annual_value"] == 6800
    assert body["value_status"] == "POSITIVE"
    assert body["spending_priorities"] is None
    assert body["spending_fit_status"] == "NOT_PROVIDED"


def test_new_fields_do_not_change_existing_calculations():
    without_new = post(interest_input_basis="no_balance").json()
    with_new = post(balance_behavior="pay_in_full", spending_priorities=["dining", "travel"]).json()

    for field in [
        "annual_spend",
        "estimated_annual_rewards",
        "annual_card_fee",
        "estimated_annual_interest_cost",
        "estimated_net_annual_value",
        "value_status",
        "reason_codes",
    ]:
        assert with_new[field] == without_new[field]


# --- Request hardening --------------------------------------------------------------------------


def test_unknown_request_fields_are_rejected_not_ignored():
    assert post(unexpected_field=1).status_code == 422
    assert post(spending_priority=["dining"]).status_code == 422
    assert post(phone="9876543210").status_code == 422


# --- spending_priorities ------------------------------------------------------------------------


def test_priorities_accept_one_to_three_allowlisted_unique_values():
    for priorities in (["dining"], ["dining", "travel"], ["dining", "travel", "grocery"], ["everyday_bills"]):
        response = post(spending_priorities=priorities, balance_behavior="pay_in_full")
        assert response.status_code == 200, priorities
        assert response.json()["spending_priorities"] == priorities


@pytest.mark.parametrize(
    "priorities",
    [
        [],
        ["dining", "travel", "grocery", "everyday_bills"],
        ["dining", "dining"],
        ["fuel"],
        ["Dining"],
        "dining",
        [1],
    ],
)
def test_priorities_reject_empty_too_many_duplicate_and_unapproved_values(priorities):
    assert post(spending_priorities=priorities).status_code == 422


def test_priorities_drive_only_a_bounded_undetermined_fit_status():
    body = post(spending_priorities=["dining", "travel"], balance_behavior="pay_in_full").json()

    assert body["spending_fit_status"] == "CATEGORY_FIT_UNDETERMINED"
    # No category claim of any kind is generated from the priorities.
    serialized = json.dumps({k: v for k, v in body.items() if k not in {"audit_event", "spending_priorities"}})
    assert "dining" not in serialized.lower()
    assert "travel" not in serialized.lower()


# --- balance_behavior ---------------------------------------------------------------------------


def test_pay_in_full_resolves_to_no_balance_with_known_net_value():
    body = post(balance_behavior="pay_in_full").json()

    assert body["interest_input_basis"] == "no_balance"
    assert body["interest_value_known"] is True
    assert body["estimated_annual_interest_cost"] == 0
    assert body["estimated_net_annual_value"] == 6800


@pytest.mark.parametrize("behavior", ["carry_balance", "not_sure"])
def test_carry_balance_and_not_sure_do_not_invent_interest_or_net_value(behavior):
    body = post(balance_behavior=behavior).json()

    assert body["interest_input_basis"] == "unknown"
    assert body["interest_value_known"] is False
    assert body["estimated_annual_interest_cost"] is None
    assert body["estimated_net_annual_value"] is None
    assert body["value_status"] == "UNKNOWN_VALUE"
    # Rewards and fee are still calculated and shown.
    assert body["estimated_annual_rewards"] == 10800
    assert body["annual_card_fee"] == 4000
    assert body["main_pressure_code"] == "INTEREST_EFFECT_UNKNOWN"


def test_carry_balance_with_known_amounts_still_computes_interest():
    body = post(balance_behavior="carry_balance", interest_input_basis="known", revolving_balance=10000, annual_interest_rate_percent=36).json()

    assert body["interest_input_basis"] == "known"
    assert body["estimated_annual_interest_cost"] == 3600
    assert body["estimated_net_annual_value"] == 10800 - 4000 - 3600


@pytest.mark.parametrize(
    "overrides",
    [
        {"balance_behavior": "pay_in_full", "interest_input_basis": "unknown"},
        {"balance_behavior": "pay_in_full", "interest_input_basis": "known", "revolving_balance": 500, "annual_interest_rate_percent": 30},
        {"balance_behavior": "pay_in_full", "revolving_balance": 500},
        {"balance_behavior": "carry_balance", "interest_input_basis": "no_balance"},
        {"balance_behavior": "not_sure", "interest_input_basis": "no_balance"},
        {"balance_behavior": "not_sure", "revolving_balance": 500},
        {"balance_behavior": "not_sure", "annual_interest_rate_percent": 30},
        {"balance_behavior": "sometimes"},
    ],
)
def test_conflicting_or_invalid_balance_behavior_is_rejected(overrides):
    assert post(**overrides).status_code == 422


# --- Rewards value semantics ---------------------------------------------------------------------


@pytest.mark.parametrize(
    "amount,period,expected",
    [(900, "monthly", 10800), (2700, "quarterly", 10800), (10800, "yearly", 10800)],
)
def test_cashback_annualisation_for_each_period(amount, period, expected):
    body = post(cashback_amount=amount, reward_period=period, balance_behavior="pay_in_full").json()

    assert body["estimated_annual_rewards"] == expected
    assert body["reward_amount_per_period"] == amount
    assert body["reward_period"] == period


def test_confirmed_zero_reward_is_known_and_distinct_from_unknown():
    zero = post(cashback_amount=0, balance_behavior="pay_in_full").json()
    unknown = post(
        reward_input_basis=None, cashback_amount=None, reward_period=None, reward_value_unknown=True, balance_behavior="pay_in_full"
    ).json()

    assert zero["reward_value_known"] is True
    assert zero["estimated_annual_rewards"] == 0
    assert zero["reward_amount_per_period"] == 0
    assert unknown["reward_value_known"] is False
    assert unknown["estimated_annual_rewards"] is None
    assert unknown["main_pressure_code"] == "REWARD_VALUE_UNKNOWN"


def test_points_quantity_only_never_gets_an_invented_rupee_value():
    body = client.post(
        ROUTE,
        json={
            "monthly_card_spend": 60000,
            "annual_card_fee": 4000,
            "reward_type": "points",
            "reward_input_basis": "earned_units",
            "reward_units_earned": 1000,
            "reward_period": "quarterly",
            "reward_value_unknown": True,
            "balance_behavior": "pay_in_full",
        },
    ).json()

    assert body["estimated_annual_rewards"] is None
    assert body["estimated_net_annual_value"] is None
    assert body["reward_value_known"] is False
    assert body["annualized_reward_units"] == 4000
    assert body["reward_units_per_period"] == 1000
    assert body["reward_amount_per_period"] is None
    assert body["main_pressure_code"] == "REWARD_VALUE_UNKNOWN"


def test_known_points_rupee_value_is_echoed_with_its_period():
    body = client.post(
        ROUTE,
        json={
            "monthly_card_spend": 25000,
            "annual_card_fee": 4000,
            "reward_type": "miles",
            "reward_input_basis": "known_reward_value",
            "reward_value_amount": 500,
            "reward_period": "monthly",
            "reward_amount_is_estimate": True,
            "balance_behavior": "pay_in_full",
        },
    ).json()

    assert body["estimated_annual_rewards"] == 6000
    assert body["reward_amount_per_period"] == 500
    assert body["reward_units_per_period"] is None


def test_not_sure_reward_type_is_an_explicit_unknown_value_path():
    body = client.post(
        ROUTE,
        json={
            "monthly_card_spend": 25000,
            "annual_card_fee": 4000,
            "reward_type": "not_sure",
            "reward_value_unknown": True,
            "balance_behavior": "pay_in_full",
        },
    ).json()

    assert body["reward_value_known"] is False
    assert body["main_pressure_code"] == "REWARD_VALUE_UNKNOWN"


# --- main_pressure_code / nudge_code -------------------------------------------------------------


def test_main_pressure_codes_follow_the_documented_precedence():
    pay = {"balance_behavior": "pay_in_full"}

    assert post(annual_card_fee=12000, **pay).json()["main_pressure_code"] == "FEE_EXCEEDS_REWARDS"
    assert post(annual_card_fee=4000, **pay).json()["main_pressure_code"] == "FEE_REDUCES_VALUE"
    assert post(annual_card_fee=10800, **pay).json()["main_pressure_code"] == "FEE_REDUCES_VALUE"
    assert post(annual_card_fee=0, **pay).json()["main_pressure_code"] == "NO_FEE_PRESSURE"
    # Interest unknown outranks the fee codes; unknown rewards outrank interest unknown.
    assert post(annual_card_fee=12000, balance_behavior="not_sure").json()["main_pressure_code"] == "INTEREST_EFFECT_UNKNOWN"
    unknown_rewards = post(
        reward_input_basis=None, cashback_amount=None, reward_period=None, reward_value_unknown=True, balance_behavior="not_sure"
    ).json()
    assert unknown_rewards["main_pressure_code"] == "REWARD_VALUE_UNKNOWN"


def test_valid_negative_net_value_is_preserved():
    body = post(annual_card_fee=12000, balance_behavior="pay_in_full").json()

    assert body["estimated_net_annual_value"] == -1200
    assert body["value_status"] == "VALUE_LEAKAGE"
    assert body["main_pressure_code"] == "FEE_EXCEEDS_REWARDS"


def test_nudge_is_a_single_bounded_code_and_disclaimer_is_present():
    body = post(balance_behavior="pay_in_full").json()

    assert body["nudge_code"] == "COMPARE_REWARDS_FEE_INTEREST"
    assert "not a card recommendation" in body["guidance_disclaimer"]


def test_result_codes_are_deterministic():
    first = post(balance_behavior="pay_in_full", spending_priorities=["grocery"]).json()
    second = post(balance_behavior="pay_in_full", spending_priorities=["grocery"]).json()

    for field in ["spending_fit_status", "main_pressure_code", "nudge_code", "reward_amount_per_period"]:
        assert first[field] == second[field]


# --- Audit redaction ----------------------------------------------------------------------------


def test_priorities_and_balance_behavior_are_never_written_to_the_audit_log(_isolated_audit_log):
    response = post(
        balance_behavior="carry_balance",
        spending_priorities=["dining", "everyday_bills"],
        # Decimal sentinels: a "." cannot occur inside a hex UUID, so random ids and timestamps in the record
        # cannot collide with them (short digit strings like "987" can, by chance).
        monthly_card_spend=54321.98,
        cashback_amount=987.65,
    )
    assert response.status_code == 200
    body = response.json()

    records = [json.loads(line) for line in _isolated_audit_log.read_text(encoding="utf-8").strip().splitlines()]
    assert len(records) == 1
    serialized = json.dumps(records)
    for forbidden in ["spending_priorities", "balance_behavior", "dining", "everyday_bills", "carry_balance", "54321.98", "987.65"]:
        assert forbidden not in serialized

    input_snapshot = records[0]["input_snapshot"]
    assert "spending_priorities" not in input_snapshot
    assert "balance_behavior" not in input_snapshot
    # The response's embedded audit event is the same redacted record.
    embedded = json.dumps(body["audit_event"])
    assert "dining" not in embedded and "everyday_bills" not in embedded


def test_rejected_new_field_requests_do_not_write_an_audit_record(_isolated_audit_log):
    assert post(spending_priorities=["dining", "dining"]).status_code == 422
    assert post(balance_behavior="pay_in_full", interest_input_basis="unknown").status_code == 422

    assert not _isolated_audit_log.exists() or _isolated_audit_log.read_text(encoding="utf-8").strip() == ""
