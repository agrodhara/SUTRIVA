from decision_engine import DecisionEngine


def test_borrow_better_high_foir_reduces():
    engine = DecisionEngine.from_json_file("decision_engine/rules/borrow_better_v0_1.json")
    result = engine.evaluate({
        "foir_after_new_emi": 0.52,
        "post_emi_surplus": 20000,
        "minimum_monthly_buffer": 10000,
        "income_verified": True,
    })
    assert result.decision == "REDUCE"
    assert "FOIR_HIGH" in result.reason_codes


def test_negative_surplus_declines_even_if_otherwise_ok():
    engine = DecisionEngine.from_json_file("decision_engine/rules/borrow_better_v0_1.json")
    result = engine.evaluate({
        "foir_after_new_emi": 0.30,
        "post_emi_surplus": -1000,
        "minimum_monthly_buffer": 10000,
        "income_verified": True,
    })
    assert result.decision == "DECLINE"
    assert "NEGATIVE_SURPLUS" in result.reason_codes


def test_ok_when_no_rule_fires():
    engine = DecisionEngine.from_json_file("decision_engine/rules/borrow_better_v0_1.json")
    result = engine.evaluate({
        "foir_after_new_emi": 0.25,
        "post_emi_surplus": 35000,
        "minimum_monthly_buffer": 10000,
        "income_verified": True,
    })
    assert result.decision == "OK"
    assert result.reason_codes == []
