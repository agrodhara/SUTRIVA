from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from statistics import mean, pstdev
from typing import Iterable, List


@dataclass(frozen=True)
class Transaction:
    customer_id: str
    amount: float
    direction: str  # credit or debit
    month: str
    category: str | None = None


def aggregate_transaction_features(transactions: Iterable[Transaction]) -> dict:
    by_customer: dict[str, List[Transaction]] = defaultdict(list)
    for tx in transactions:
        by_customer[tx.customer_id].append(tx)

    features = {}
    for customer_id, rows in by_customer.items():
        credits = [tx.amount for tx in rows if tx.direction == "credit"]
        debits = [tx.amount for tx in rows if tx.direction == "debit"]
        total_credit = sum(credits)
        total_debit = sum(debits)
        features[customer_id] = {
            "transaction_count": len(rows),
            "credit_count": len(credits),
            "debit_count": len(debits),
            "total_credit": total_credit,
            "total_debit": total_debit,
            "debit_credit_ratio": total_debit / total_credit if total_credit else None,
            "avg_credit": mean(credits) if credits else 0,
            "avg_debit": mean(debits) if debits else 0,
            "credit_volatility": pstdev(credits) if len(credits) > 1 else 0,
            "debit_volatility": pstdev(debits) if len(debits) > 1 else 0,
        }
    return features
