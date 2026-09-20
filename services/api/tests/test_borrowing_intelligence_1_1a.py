"""Borrow Better 1.1A: request/response contract, policy rate, EMI preview, nudge and privacy."""
import json
import logging

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.affordability import LOAN_REDUCTION_NUDGE_AMOUNT, estimate_emi, estimate_loan_reduction_nudge

client = TestClient(app)

CHECK_URL = "/v1/borrowing-intelligence/comfortable-borrowing-check"
PREVIEW_URL = "/v1/borrowing-intelligence/emi-preview"

# Final-journey reference inputs (four visible essentials; the legacy fifth is not collected).
REFERENCE = {
    "calculation_mode": "track_11a_breakdown",
    "monthly_income": 120000,
    "existing_debt_payments": 18000,
    "housing_rent": 28000,
    "household_utilities": 11000,
    "dependants_education": 12000,
    "recurring_medical_insurance": 6000,
    "desired_borrowing_amount": 500000,
    "desired_tenure_months": 36,
    "month_end_position": "money_left",
}


def nearest_100(value: float) -> int:
    return int(round(value / 100.0)) * 100


def check(**overrides):
    payload = {**REFERENCE, **overrides}
    payload = {key: value for key, value in payload.items() if value is not ...}
    return client.post(CHECK_URL, json=payload)


@pytest.fixture(autouse=True)
def _audit_to_tmp(monkeypatch, tmp_path):
    monkeypatch.setenv("AUDIT_LOG_PATH", str(tmp_path / "audit_events.jsonl"))


def set_policy_rate(monkeypatch, percent: float) -> None:
    monkeypatch.setattr("app.models.borrowing_intelligence.borrow_illustrative_annual_rate_percent", lambda: percent)
    monkeypatch.setattr("app.routers.borrowing_intelligence.borrow_illustrative_annual_rate_percent", lambda: percent)


# ---- Reference reconciliation ----

def test_reference_result_to_exact_precision():
    response = check()
    assert response.status_code == 200
    body = response.json()

    assert body["illustrative_annual_rate_percent"] == 14
    assert body["existing_debt_payments"] == 18000
    assert body["non_debt_commitments"] == 57000
    assert body["estimated_new_monthly_commitment"] == 17088.81
    assert body["debt_ratio_before"] == 0.15
    assert body["debt_ratio_after"] == 0.2924
    assert body["breathing_room_before"] == 45000
    assert body["breathing_room_after"] == 27911.19
    assert body["total_repayment"] == 615197.34
    assert body["total_interest"] == 115197.34


def test_reference_display_rounding_matches_the_final_journey():
    body = check().json()

    assert nearest_100(body["estimated_new_monthly_commitment"]) == 17100
    assert nearest_100(body["breathing_room_before"]) == 45000
    assert nearest_100(body["breathing_room_after"]) == 27900
    assert round(body["debt_ratio_before"] * 100) == 15
    assert round(body["debt_ratio_after"] * 100) == 29
    assert round(body["total_repayment"] / 100000, 2) == 6.15
    assert round(body["total_interest"] / 100000, 2) == 1.15


def test_main_pressure_is_the_backend_emi_amount():
    body = check().json()

    assert body["main_pressure"]["code"] == "PROPOSED_EMI_REDUCES_BREATHING_ROOM"
    assert body["main_pressure"]["monthly_amount"] == body["estimated_new_monthly_commitment"]
    assert body["main_pressure"]["monthly_amount"] == round(body["breathing_room_before"] - body["breathing_room_after"], 2)


# ---- ₹1 lakh loan-reduction nudge ----

def test_nudge_for_reference_case_is_about_3400():
    nudge = check().json()["loan_reduction_nudge"]

    assert nudge["reduction_amount"] == LOAN_REDUCTION_NUDGE_AMOUNT == 100000
    expected = estimate_emi(500000, 0.14, 36) - estimate_emi(400000, 0.14, 36)
    assert nudge["monthly_breathing_room_preserved"] == round(expected, 2)
    assert nearest_100(nudge["monthly_breathing_room_preserved"]) == 3400


@pytest.mark.parametrize("amount", [100000, 99999, 50000, 1])
def test_no_nudge_at_or_below_one_lakh(amount):
    response = check(desired_borrowing_amount=amount)
    assert response.status_code == 200
    assert response.json()["loan_reduction_nudge"] is None


def test_nudge_present_just_above_one_lakh_uses_a_positive_principal():
    body = check(desired_borrowing_amount=100001).json()
    nudge = body["loan_reduction_nudge"]
    assert nudge is not None
    assert nudge["monthly_breathing_room_preserved"] > 0
    # Alternative principal is 1 rupee, so almost the whole EMI is preserved.
    assert nudge["monthly_breathing_room_preserved"] == pytest.approx(body["estimated_new_monthly_commitment"], abs=0.05)


def test_nudge_helper_returns_none_for_non_positive_alternative_principal():
    assert estimate_loan_reduction_nudge(100000, 0.14, 36) is None
    assert estimate_loan_reduction_nudge(0, 0.14, 36) is None


def test_nudge_helper_with_zero_rate_is_simple_division():
    nudge = estimate_loan_reduction_nudge(500000, 0, 20)
    assert nudge["monthly_breathing_room_preserved"] == 5000


# ---- Blank, zero, negative, essentials ----

def test_four_visible_essentials_are_enough_and_fifth_defaults_to_zero():
    body = check().json()
    assert body["non_debt_commitments"] == 57000

    with_fifth = check(other_essential_commitments=1000).json()
    assert with_fifth["non_debt_commitments"] == 58000
    assert with_fifth["breathing_room_before"] == 44000


@pytest.mark.parametrize("field", ["housing_rent", "household_utilities", "dependants_education", "recurring_medical_insurance", "existing_debt_payments"])
def test_missing_or_null_required_fields_are_rejected(field):
    assert check(**{field: ...}).status_code == 422
    assert check(**{field: None}).status_code == 422


@pytest.mark.parametrize("field", ["housing_rent", "household_utilities", "dependants_education", "recurring_medical_insurance", "existing_debt_payments", "other_essential_commitments"])
def test_negative_inputs_are_rejected(field):
    assert check(**{field: -1}).status_code == 422


@pytest.mark.parametrize("field", ["monthly_income", "desired_borrowing_amount"])
def test_zero_income_or_amount_is_rejected(field):
    assert check(**{field: 0}).status_code == 422


def test_confirmed_zero_payments_and_essentials_are_valid():
    response = check(
        existing_debt_payments=0,
        housing_rent=0,
        household_utilities=0,
        dependants_education=0,
        recurring_medical_insurance=0,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["debt_ratio_before"] == 0
    assert body["breathing_room_before"] == 120000


def test_negative_breathing_room_is_preserved_not_clamped():
    body = check(desired_borrowing_amount=5000000).json()
    assert body["breathing_room_after"] < 0
    assert body["breathing_room_after"] == round(body["breathing_room_before"] - body["estimated_new_monthly_commitment"], 2)
    assert body["main_pressure"]["monthly_amount"] > body["breathing_room_before"]


# ---- Month-end position, purpose, EMI-ending ----

def test_declared_context_does_not_change_the_numeric_calculation():
    numeric = [
        "estimated_new_monthly_commitment", "total_monthly_commitment", "commitment_ratio", "debt_ratio_before",
        "debt_ratio_after", "committed_ratio_before", "committed_ratio_after", "breathing_room_before",
        "breathing_room_after", "total_repayment", "total_interest", "comfort_status", "reason_codes",
    ]
    baseline = check(month_end_position=...).json()
    for position in ["money_left", "break_even", "fall_short", "not_sure"]:
        for purpose in [..., "home_improvement", "other"]:
            for emi in [..., "yes", "no", "not_sure"]:
                body = check(month_end_position=position, loan_purpose=purpose, existing_emi_ending_within_six_months=emi).json()
                assert {key: body[key] for key in numeric} == {key: baseline[key] for key in numeric}


def test_reconciliation_and_emi_ending_notes_are_bounded_codes():
    assert check(month_end_position="fall_short").json()["reconciliation_note"] == "MONTH_END_FALL_SHORT"
    assert check(month_end_position="not_sure").json()["reconciliation_note"] == "MONTH_END_POSITION_UNKNOWN"
    assert check(month_end_position="money_left").json()["reconciliation_note"] is None
    assert check(month_end_position="break_even").json()["reconciliation_note"] is None
    assert check(month_end_position=...).json()["reconciliation_note"] is None

    assert check(existing_emi_ending_within_six_months="yes").json()["emi_ending_note"] == "EMI_MAY_END_WITHIN_SIX_MONTHS"
    assert check(existing_emi_ending_within_six_months="no").json()["emi_ending_note"] is None
    assert check(existing_emi_ending_within_six_months="not_sure").json()["emi_ending_note"] is None


def test_month_end_position_does_not_add_a_decision_reason_code():
    base = check(month_end_position="money_left").json()["reason_codes"]
    assert check(month_end_position="fall_short").json()["reason_codes"] == base
    assert check(month_end_position="not_sure").json()["reason_codes"] == base


@pytest.mark.parametrize(
    "overrides",
    [
        {"month_end_position": "comfortable"},
        {"month_end_position": ""},
        {"loan_purpose": "holiday"},
        {"loan_purpose": "Home improvement"},
        {"existing_emi_ending_within_six_months": "maybe"},
        {"existing_emi_ending_within_six_months": True},
    ],
)
def test_invalid_declared_context_is_rejected(overrides):
    assert check(**overrides).status_code == 422


@pytest.mark.parametrize("purpose", ["home_improvement", "education", "medical", "debt_consolidation", "vehicle", "household_purchase", "other"])
def test_every_approved_purpose_is_accepted(purpose):
    assert check(loan_purpose=purpose).status_code == 200


# ---- Unknown fields ----

@pytest.mark.parametrize("extra", [{"unexpected_field": 1}, {"purpose_note": "free text"}, {"phone": "9999999999"}])
def test_unknown_fields_are_rejected_on_the_full_check(extra):
    assert check(**extra).status_code == 422


def test_unknown_fields_are_rejected_on_the_legacy_mode_too():
    response = client.post(CHECK_URL, json={
        "calculation_mode": "legacy_total_commitments",
        "monthly_income": 100000,
        "existing_monthly_commitments": 25000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
        "mystery": 1,
    })
    assert response.status_code == 422


# ---- Policy rate ----

def test_client_rate_omitted_uses_the_configured_rate():
    body = check().json()
    assert body["illustrative_annual_rate_percent"] == 14
    assert body["estimated_new_monthly_commitment"] == round(estimate_emi(500000, 0.14, 36), 2)


def test_client_rate_equal_to_configured_rate_is_accepted():
    assert check(illustrative_annual_rate_percent=14).status_code == 200
    assert check(illustrative_annual_rate_percent=14.0).status_code == 200


@pytest.mark.parametrize("rate", [0, 13.99, 14.01, 15, 20, 100])
def test_client_rate_that_differs_is_rejected_with_422(rate):
    response = check(illustrative_annual_rate_percent=rate)
    assert response.status_code == 422
    assert "configured by policy" in json.dumps(response.json())


def test_mismatched_rate_is_rejected_in_legacy_mode_too():
    response = client.post(CHECK_URL, json={
        "calculation_mode": "legacy_total_commitments",
        "monthly_income": 100000,
        "existing_monthly_commitments": 25000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
        "illustrative_annual_rate_percent": 9,
    })
    assert response.status_code == 422


def test_backend_uses_and_echoes_the_configured_rate_when_policy_changes(monkeypatch):
    set_policy_rate(monkeypatch, 12.5)

    body = check().json()
    assert body["illustrative_annual_rate_percent"] == 12.5
    assert body["estimated_new_monthly_commitment"] == round(estimate_emi(500000, 0.125, 36), 2)

    assert check(illustrative_annual_rate_percent=12.5).status_code == 200
    # The old value is now the mismatch.
    assert check(illustrative_annual_rate_percent=14).status_code == 422


# ---- EMI preview ----

def test_preview_uses_the_same_formula_as_the_full_check():
    preview = client.post(PREVIEW_URL, json={"desired_borrowing_amount": 500000, "desired_tenure_months": 36})
    assert preview.status_code == 200
    body = preview.json()

    assert body["illustrative_annual_rate_percent"] == 14
    assert body["estimated_monthly_emi"] == check().json()["estimated_new_monthly_commitment"] == 17088.81
    assert "not a loan offer" in body["guidance_disclaimer"]


@pytest.mark.parametrize("tenure", [12, 24, 36, 48, 60])
def test_preview_matches_full_check_for_every_journey_tenure(tenure):
    preview = client.post(PREVIEW_URL, json={"desired_borrowing_amount": 750000, "desired_tenure_months": tenure}).json()
    full = check(desired_borrowing_amount=750000, desired_tenure_months=tenure).json()
    assert preview["estimated_monthly_emi"] == full["estimated_new_monthly_commitment"]


def test_preview_follows_the_configured_rate(monkeypatch):
    set_policy_rate(monkeypatch, 10)
    body = client.post(PREVIEW_URL, json={"desired_borrowing_amount": 500000, "desired_tenure_months": 36}).json()
    assert body["illustrative_annual_rate_percent"] == 10
    assert body["estimated_monthly_emi"] == round(estimate_emi(500000, 0.10, 36), 2)


@pytest.mark.parametrize(
    "payload",
    [
        {"desired_borrowing_amount": 500000, "desired_tenure_months": 36, "illustrative_annual_rate_percent": 14},
        {"desired_borrowing_amount": 500000, "desired_tenure_months": 36, "illustrative_annual_rate_percent": 9},
        {"desired_borrowing_amount": 500000, "desired_tenure_months": 36, "monthly_income": 120000},
        {"desired_borrowing_amount": 0, "desired_tenure_months": 36},
        {"desired_borrowing_amount": -5, "desired_tenure_months": 36},
        {"desired_borrowing_amount": 500000, "desired_tenure_months": 0},
        {"desired_borrowing_amount": 500000, "desired_tenure_months": 361},
        {"desired_tenure_months": 36},
        {"desired_borrowing_amount": 500000},
        {},
    ],
)
def test_preview_rejects_invalid_or_extra_input(payload):
    assert client.post(PREVIEW_URL, json=payload).status_code == 422


def test_preview_writes_no_audit_event_and_no_log_of_raw_input(tmp_path, monkeypatch, caplog):
    audit_file = tmp_path / "preview_audit.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_file))

    with caplog.at_level(logging.DEBUG):
        response = client.post(PREVIEW_URL, json={"desired_borrowing_amount": 543210.98, "desired_tenure_months": 47})

    assert response.status_code == 200
    assert not audit_file.exists()
    assert "543210.98" not in caplog.text


def test_preview_does_not_touch_the_database(monkeypatch):
    def fail(*args, **kwargs):  # pragma: no cover - only runs on regression
        raise AssertionError("EMI preview must not open a database session")

    monkeypatch.setattr("app.db.session.get_session_factory", fail, raising=False)
    monkeypatch.setattr("app.db.engine.get_engine", fail, raising=False)
    assert client.post(PREVIEW_URL, json={"desired_borrowing_amount": 500000, "desired_tenure_months": 36}).status_code == 200


# ---- Privacy-safe audit ----

def test_audit_snapshot_contains_no_amounts_or_declared_categories(tmp_path, monkeypatch):
    audit_file = tmp_path / "audit_events.jsonl"
    monkeypatch.setenv("AUDIT_LOG_PATH", str(audit_file))

    response = check(
        monthly_income=98765.43,
        existing_debt_payments=21098.76,
        housing_rent=10001.11,
        household_utilities=2002.22,
        dependants_education=3003.33,
        recurring_medical_insurance=4004.44,
        desired_borrowing_amount=543210.98,
        desired_tenure_months=48,
        month_end_position="fall_short",
        loan_purpose="debt_consolidation",
        existing_emi_ending_within_six_months="yes",
    )
    assert response.status_code == 200

    serialized = audit_file.read_text(encoding="utf-8")
    for sentinel in ["98765.43", "21098.76", "10001.11", "2002.22", "3003.33", "4004.44", "543210.98"]:
        assert sentinel not in serialized
    for category in ["fall_short", "debt_consolidation", "month_end_position", "loan_purpose", "existing_emi_ending"]:
        assert category not in serialized
    for key in ["main_pressure", "loan_reduction_nudge", "reconciliation_note", "emi_ending_note", "monthly_amount"]:
        assert f'"{key}"' not in serialized


# ---- Legacy Track 1.0 compatibility ----

def test_legacy_total_commitments_mode_is_unchanged():
    response = client.post(CHECK_URL, json={
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
    assert body["illustrative_annual_rate_percent"] == 14
    assert body["main_pressure"]["monthly_amount"] == body["estimated_new_monthly_commitment"]


def test_legacy_mode_infers_calculation_mode_when_omitted():
    response = client.post(CHECK_URL, json={
        "monthly_income": 100000,
        "existing_monthly_commitments": 25000,
        "desired_borrowing_amount": 500000,
        "desired_tenure_months": 36,
    })
    assert response.status_code == 200


def test_legacy_quick_check_route_is_unchanged():
    response = client.post("/v1/borrow-better/quick-check", json={
        "declared_monthly_income": 100000,
        "existing_monthly_emi": 20000,
        "requested_loan_amount": 500000,
        "requested_tenor_months": 36,
        "indicative_interest_rate_pa": 0.14,
    })
    assert response.status_code == 200
