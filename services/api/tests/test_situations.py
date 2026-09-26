from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.situations import (
    SituationValidationError,
    calculate_annual_fee,
    calculate_card_fit,
    calculate_carrying_balance,
    calculate_loan_offer,
    calculate_multi_card,
    calculate_new_purchase,
    calculate_rejected_shortfall,
    calculate_rising_emis,
    calculate_unused_points,
    implied_annual_rate_percent,
    validate_annual_fee,
    validate_card_fit,
    validate_carrying_balance,
    validate_loan_offer,
    validate_multi_card,
    validate_new_purchase,
    validate_rejected_shortfall,
    validate_rising_emis,
    validate_unused_points,
)

client = TestClient(app)


def _emi_for_rate(principal: float, annual_rate_percent: float, months: int) -> float:
    """The textbook EMI formula, used only to build a known-answer fixture for the implied-rate bisection
    — this is deliberately the forward calculation, independent of implied_annual_rate_percent's own
    (bisection) method, so the round-trip test does not just check the function agrees with itself."""
    r = annual_rate_percent / 1200
    if r == 0:
        return principal / months
    factor = (1 + r) ** months
    return principal * r * factor / (factor - 1)


# --- implied_annual_rate_percent ------------------------------------------------------------------


def test_implied_rate_recovers_a_known_rate_within_a_small_tolerance() -> None:
    principal, months, known_rate = 800_000.0, 48, 12.5
    emi = _emi_for_rate(principal, known_rate, months)
    estimated = implied_annual_rate_percent(principal, emi, months)
    assert estimated is not None
    assert abs(estimated - known_rate) < 0.05


def test_implied_rate_is_zero_when_payments_exactly_equal_principal() -> None:
    assert implied_annual_rate_percent(120_000, 10_000, 12) == 0.0


def test_implied_rate_is_none_when_payments_cannot_cover_principal() -> None:
    assert implied_annual_rate_percent(800_000, 10_000, 12) is None


# --- Rising EMIs -----------------------------------------------------------------------------------


def test_rising_emis_matches_the_reviewed_example() -> None:
    validate_rising_emis(income=75_000, essentials=35_000, emis=32_000)
    r = calculate_rising_emis(income=75_000, essentials=35_000, emis=32_000, overdue="no")
    assert r.headline == "₹8,000"
    assert "narrow" in r.insight  # room (8,000) is below 15% of income (11,250)


def test_rising_emis_shortfall_is_shown_as_a_positive_shortfall_bar() -> None:
    r = calculate_rising_emis(income=50_000, essentials=35_000, emis=32_000, overdue="no")
    assert r.headline.startswith("Short by")
    shortfall_bars = [b for b in r.bars if b.label == "Shortfall"]
    assert shortfall_bars and shortfall_bars[0].value == 17_000  # positive magnitude, not negative


def test_rising_emis_overdue_yes_overrides_the_room_insight() -> None:
    r = calculate_rising_emis(income=75_000, essentials=35_000, emis=32_000, overdue="yes")
    assert "overdue" in r.insight


def test_rising_emis_rejects_zero_income() -> None:
    with pytest.raises(SituationValidationError):
        validate_rising_emis(income=0, essentials=1000, emis=1000)


def test_rising_emis_rejects_negative_essentials() -> None:
    with pytest.raises(SituationValidationError):
        validate_rising_emis(income=50_000, essentials=-1, emis=1000)


def test_rising_emis_rejects_a_huge_entry() -> None:
    with pytest.raises(SituationValidationError):
        validate_rising_emis(income=50_000, essentials=1, emis=10**12)


# --- New purchase ------------------------------------------------------------------------------------


def test_new_purchase_matches_the_reviewed_example() -> None:
    validate_new_purchase(price=1_200_000, down=300_000, emi=24_000, months=48, income=95_000, costs=60_000)
    r = calculate_new_purchase(price=1_200_000, down=300_000, emi=24_000, months=48, income=95_000, costs=60_000)
    assert r.headline == "₹11,000"
    assert "₹9,00,000" in r.insight  # amount to finance: 1,200,000 - 300,000, Indian grouping


def test_new_purchase_rejects_down_payment_above_price() -> None:
    with pytest.raises(SituationValidationError):
        validate_new_purchase(price=100_000, down=200_000, emi=5_000, months=24, income=50_000, costs=10_000)


def test_new_purchase_rejects_payments_that_cannot_cover_the_financed_amount() -> None:
    """A purchase-price/EMI/tenure combination whose total payments fall short of the amount financed must
    be rejected outright, not silently accepted with an understated result."""
    with pytest.raises(SituationValidationError, match="do not cover"):
        validate_new_purchase(price=1_200_000, down=300_000, emi=1_000, months=12, income=95_000, costs=60_000)


def test_new_purchase_rejects_a_fractional_tenure() -> None:
    with pytest.raises(SituationValidationError):
        validate_new_purchase(price=100_000, down=10_000, emi=5_000, months=18.5, income=50_000, costs=10_000)  # type: ignore[arg-type]


def test_new_purchase_never_implies_running_costs_are_included() -> None:
    r = calculate_new_purchase(price=1_200_000, down=300_000, emi=24_000, months=48, income=95_000, costs=60_000)
    assert "running cost" in r.insight or "insurance" in r.insight


# --- Loan offer (lead path) --------------------------------------------------------------------------


def test_loan_offer_matches_the_reviewed_example_scheduled_repayment_and_interest() -> None:
    validate_loan_offer(principal=800_000, emi=22_000, months=48, income=95_000, costs=60_000)
    r = calculate_loan_offer(principal=800_000, emi=22_000, months=48, income=95_000, costs=60_000)
    assert r.detail == "₹10,56,000 scheduled repayment over 48 months on ₹8,00,000 principal"  # Indian grouping
    assert r.headline == "₹2,56,000 estimated interest"


def test_loan_offer_rate_is_qualified_as_an_estimate_not_the_lenders_apr() -> None:
    r = calculate_loan_offer(principal=800_000, emi=22_000, months=48, income=95_000, costs=60_000)
    assert "not the lender" in r.insight
    assert "estimated implied" in r.insight.lower()


def test_loan_offer_reports_monthly_room_from_the_actual_inputs() -> None:
    # income 95,000 - costs 60,000 - emi 22,000 = 13,000
    r = calculate_loan_offer(principal=800_000, emi=22_000, months=48, income=95_000, costs=60_000)
    assert "₹13,000" in r.insight


def test_loan_offer_rejects_payments_below_principal() -> None:
    with pytest.raises(SituationValidationError):
        validate_loan_offer(principal=800_000, emi=1_000, months=12, income=95_000, costs=60_000)


def test_loan_offer_rejects_zero_principal() -> None:
    with pytest.raises(SituationValidationError):
        validate_loan_offer(principal=0, emi=1_000, months=12, income=95_000, costs=60_000)


# --- Rejected / offered less ---------------------------------------------------------------------------


def test_rejected_shortfall_never_implies_it_knows_the_lenders_reason() -> None:
    r = calculate_rejected_shortfall(emi=22_000, income=95_000, costs=60_000)
    assert "cannot explain why" in r.insight


def test_rejected_shortfall_note_disclaims_credit_eligibility() -> None:
    r = calculate_rejected_shortfall(emi=22_000, income=95_000, costs=60_000)
    assert "does not indicate credit eligibility" in r.note


# --- Annual fee (lead path) ---------------------------------------------------------------------------


def test_annual_fee_matches_the_reviewed_example() -> None:
    validate_annual_fee(redeemed=4_200, fee=3_000, interest=1_500)
    r = calculate_annual_fee(redeemed=4_200, fee=3_000, interest=1_500)
    assert r.headline == "Ahead by ₹1,200"


def test_annual_fee_never_implies_cancelling_erases_interest() -> None:
    r = calculate_annual_fee(redeemed=4_200, fee=3_000, interest=1_500)
    assert "would not erase interest" in r.insight


def test_annual_fee_keeps_unknown_interest_separate_and_does_not_invent_it() -> None:
    r = calculate_annual_fee(redeemed=4_200, fee=3_000, interest=None)
    assert "not entered" in r.insight
    assert "1,500" not in r.insight


def test_annual_fee_is_never_a_keep_cancel_or_upgrade_recommendation() -> None:
    r = calculate_annual_fee(redeemed=100, fee=5_000, interest=None)
    assert "not a keep, cancel or upgrade recommendation" in r.insight


def test_annual_fee_rejects_negative_fee() -> None:
    with pytest.raises(SituationValidationError):
        validate_annual_fee(redeemed=100, fee=-1, interest=None)


# --- Card fit --------------------------------------------------------------------------------------


def test_card_fit_rates_are_explicitly_hypothetical() -> None:
    r = calculate_card_fit(category="groceries", spend=12_000)
    assert "made-up examples" in r.insight
    assert r.headline == "₹240 a month in this example"  # (12000*0.03)-(12000*0.01) = 240


def test_card_fit_rejects_zero_spend() -> None:
    with pytest.raises(SituationValidationError):
        validate_card_fit(spend=0)


def test_card_fit_never_becomes_a_verdict_on_the_customers_actual_card() -> None:
    r = calculate_card_fit(category="travel", spend=20_000)
    assert "does not measure your card" in r.note


# --- Carrying a balance -----------------------------------------------------------------------------


def test_carrying_balance_unknown_interest_never_invents_a_number() -> None:
    r = calculate_carrying_balance(known="no", interest=None, rewards=450)
    assert r.headline == "Interest cost unknown"
    assert "has been invented" not in r.insight  # sanity: phrase appears in note, not fabricated as a value
    assert "no interest estimate has been invented".lower() in r.note.lower()


def test_carrying_balance_known_interest_compares_the_same_period() -> None:
    validate_carrying_balance(known="yes", interest=2_100, rewards=450)
    r = calculate_carrying_balance(known="yes", interest=2_100, rewards=450)
    assert r.headline == "₹1,650 more interest than rewards"


def test_carrying_balance_requires_interest_when_known_is_yes() -> None:
    with pytest.raises(SituationValidationError):
        validate_carrying_balance(known="yes", interest=None, rewards=450)


# --- Several cards -----------------------------------------------------------------------------------


def test_multi_card_totals_do_not_claim_category_overlap_insight() -> None:
    r = calculate_multi_card(fee1=3_000, reward1=4_200, fee2=1_500, reward2=900)
    assert "cannot show category overlap" in r.insight
    assert "Card 1: ahead by ₹1,200" in r.headline
    assert "Card 2: short by ₹600" in r.headline


def test_multi_card_rejects_negative_fee() -> None:
    with pytest.raises(SituationValidationError):
        validate_multi_card(fee1=-1, reward1=0, fee2=0, reward2=0)


# --- Unused points -----------------------------------------------------------------------------------


def test_unused_points_zero_points_short_circuits_with_no_bars() -> None:
    r = calculate_unused_points(points=0, value=None, fee=None)
    assert r.headline == "No unused points entered"
    assert r.bars == []


def test_unused_points_without_a_value_never_invents_a_conversion() -> None:
    r = calculate_unused_points(points=12_000, value=None, fee=3_000)
    assert "12,000 points without a cash value" in r.headline
    assert r.bars == []  # no rupee bar without an issuer-stated value


def test_unused_points_with_value_and_fee_compares_them() -> None:
    r = calculate_unused_points(points=12_000, value=1_800, fee=3_000)
    assert "below the ₹3,000 fee" in r.scenario


def test_unused_points_never_infers_expiry_or_value_from_the_points_count_alone() -> None:
    r = calculate_unused_points(points=12_000, value=None, fee=None)
    assert "No expiry or cash value is inferred from the points count." == r.note


# --- Router-level: validation surfaces as 422, success returns the shared shape -----------------------


def test_loan_offer_endpoint_returns_the_shared_response_shape() -> None:
    response = client.post(
        "/v1/borrowing-intelligence/loan-offer-check",
        json={"principal": 800_000, "emi": 22_000, "months": 48, "income": 95_000, "costs": 60_000},
    )
    assert response.status_code == 200
    body = response.json()
    assert set(body.keys()) == {"title", "headline", "detail", "insight", "scenario", "note", "bars"}
    assert body["bars"][0]["tone"] == "net"


def test_loan_offer_endpoint_rejects_inconsistent_entries_with_422() -> None:
    response = client.post(
        "/v1/borrowing-intelligence/loan-offer-check",
        json={"principal": 800_000, "emi": 1_000, "months": 12, "income": 95_000, "costs": 60_000},
    )
    assert response.status_code == 422


def test_annual_fee_endpoint_extra_field_is_rejected() -> None:
    response = client.post(
        "/v1/money-value/annual-fee-check",
        json={"redeemed": 100, "fee": 50, "interest": None, "unexpected": "value"},
    )
    assert response.status_code == 422


def test_new_purchase_endpoint_rejects_a_negative_amount() -> None:
    response = client.post(
        "/v1/borrowing-intelligence/new-purchase-check",
        json={"price": -1, "down": 0, "emi": 1000, "months": 12, "income": 50_000, "costs": 10_000},
    )
    assert response.status_code == 422


def test_all_nine_endpoints_are_reachable_with_their_own_minimal_valid_payload() -> None:
    calls = [
        ("/v1/borrowing-intelligence/rising-emis-check", {"income": 75000, "essentials": 35000, "emis": 32000, "overdue": "no"}),
        ("/v1/borrowing-intelligence/new-purchase-check", {"price": 1200000, "down": 300000, "emi": 24000, "months": 48, "income": 95000, "costs": 60000}),
        ("/v1/borrowing-intelligence/loan-offer-check", {"principal": 800000, "emi": 22000, "months": 48, "income": 95000, "costs": 60000}),
        ("/v1/borrowing-intelligence/rejected-shortfall-check", {"emi": 22000, "income": 95000, "costs": 60000}),
        ("/v1/money-value/annual-fee-check", {"redeemed": 4200, "fee": 3000, "interest": 1500}),
        ("/v1/money-value/card-fit-check", {"category": "groceries", "spend": 12000}),
        ("/v1/money-value/carrying-balance-check", {"known": "yes", "interest": 2100, "rewards": 450}),
        ("/v1/money-value/multi-card-check", {"fee1": 3000, "reward1": 4200, "fee2": 1500, "reward2": 900}),
        ("/v1/money-value/unused-points-check", {"points": 12000, "value": None, "fee": 3000}),
    ]
    for path, payload in calls:
        response = client.post(path, json=payload)
        assert response.status_code == 200, (path, response.text)
