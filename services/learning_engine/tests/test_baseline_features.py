from learning_engine.baseline_features import Transaction, aggregate_transaction_features


def test_aggregate_transaction_features():
    rows = [
        Transaction("c1", 1000, "credit", "2026-01", "salary"),
        Transaction("c1", 200, "debit", "2026-01", "food"),
        Transaction("c1", 300, "debit", "2026-01", "utility"),
    ]
    features = aggregate_transaction_features(rows)["c1"]
    assert features["transaction_count"] == 3
    assert features["total_credit"] == 1000
    assert features["total_debit"] == 500
    assert features["debit_credit_ratio"] == 0.5
