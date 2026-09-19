from __future__ import annotations

import uuid
from collections.abc import Mapping
from datetime import datetime, timezone
from typing import Any, Dict

from app.services.storage import audit_store


AUDIT_SCHEMA_VERSION = "audit-redacted-v1"

EVENT_JOURNEY = {
    "money_value_quick_check": "money_value",
    "money_value_check": "money_value",
    "borrow_better_quick_check": "comfortable_borrowing",
    "comfortable_borrowing_check": "comfortable_borrowing",
}

EVENT_ENDPOINT = {
    "money_value_quick_check": "/v1/money-value/quick-check",
    "money_value_check": "/v1/financial-intelligence/money-value-check",
    "borrow_better_quick_check": "/v1/borrow-better/quick-check",
    "comfortable_borrowing_check": "/v1/borrowing-intelligence/comfortable-borrowing-check",
}


def _as_dict(source: Any) -> Dict[str, Any]:
    if source is None:
        return {}
    if isinstance(source, Mapping):
        return dict(source)

    model_dump = getattr(source, "model_dump", None)
    if callable(model_dump):
        return model_dump(exclude_none=False)

    raise TypeError("Audit snapshots must be built from mappings or Pydantic models")


def _base_snapshot(event_type: str) -> Dict[str, Any]:
    return {
        "schema_version": AUDIT_SCHEMA_VERSION,
        "journey": EVENT_JOURNEY.get(event_type, "unknown"),
        "endpoint": EVENT_ENDPOINT.get(event_type, "unknown"),
    }


def build_input_audit_snapshot(event_type: str, source: Any) -> Dict[str, Any]:
    data = _as_dict(source)
    snapshot = _base_snapshot(event_type)

    if event_type == "money_value_quick_check":
        snapshot.update({
            "request_kind": "legacy_track_1_0",
            "rewards_mode": "rate_percent",
            "interest_mode": "known" if data.get("revolving_balance") is not None else "not_declared",
            "declared_fields": {
                "spend": data.get("monthly_card_spend") is not None,
                "fee": data.get("annual_card_fee") is not None,
                "reward_rate": data.get("reward_rate_percent") is not None,
                "balance": data.get("revolving_balance") is not None,
                "interest_rate": data.get("revolving_interest_rate_pa") is not None,
                "subscription_cost": data.get("unused_subscription_cost_monthly") is not None,
            },
        })
        return snapshot

    if event_type == "money_value_check":
        snapshot.update({
            "request_kind": "preferred_public_route",
            "reward_type": data.get("reward_type", "cashback"),
            "rewards_mode": data.get("reward_input_basis") or "implicit",
            "reward_period": data.get("reward_period"),
            "reward_value_unknown": bool(data.get("reward_value_unknown", False)),
            "reward_amount_is_estimate": bool(data.get("reward_amount_is_estimate", False)),
            "interest_mode": data.get("interest_input_basis") or "implicit",
            "interest_value_unknown": bool(data.get("interest_value_unknown", False)),
            "declared_fields": {
                "spend": data.get("monthly_card_spend") is not None,
                "fee": data.get("annual_card_fee") is not None,
                "reward_rate": data.get("estimated_reward_rate_percent") is not None,
                "cashback": data.get("cashback_amount") is not None,
                "reward_value": data.get("reward_value_amount") is not None,
                "reward_units": data.get("reward_units_earned") is not None,
                "reward_unit_value": data.get("rupee_value_per_reward_unit") is not None,
                "balance": data.get("revolving_balance") is not None,
                "interest_rate": data.get("annual_interest_rate_percent") is not None,
            },
        })
        return snapshot

    if event_type == "borrow_better_quick_check":
        snapshot.update({
            "request_kind": "legacy_track_1_0",
            "calculation_mode": "legacy_quick_check",
            "income_verified": bool(data.get("income_verified", False)),
            "declared_fields": {
                "income": data.get("declared_monthly_income") is not None,
                "existing_commitments": data.get("existing_monthly_emi") is not None,
                "borrowing_amount": data.get("requested_loan_amount") is not None,
                "tenure": data.get("requested_tenor_months") is not None,
                "illustrative_rate": data.get("indicative_interest_rate_pa") is not None,
                "non_emi_commitments": data.get("monthly_non_emi_commitments") is not None,
            },
        })
        return snapshot

    if event_type == "comfortable_borrowing_check":
        snapshot.update({
            "request_kind": "preferred_public_route",
            "calculation_mode": data.get("calculation_mode"),
            "income_verified": bool(data.get("income_verified", False)),
            "declared_fields": {
                "income": data.get("monthly_income") is not None,
                "legacy_commitments": data.get("existing_monthly_commitments") is not None,
                "debt_commitments": data.get("existing_debt_payments") is not None,
                "grouped_commitments_complete": all(
                    data.get(field) is not None
                    for field in (
                        "housing_rent",
                        "household_utilities",
                        "dependants_education",
                        "recurring_medical_insurance",
                        "other_essential_commitments",
                    )
                ),
                "borrowing_amount": data.get("desired_borrowing_amount") is not None,
                "tenure": data.get("desired_tenure_months") is not None,
                "illustrative_rate": data.get("illustrative_annual_rate_percent") is not None,
            },
        })
        return snapshot

    return snapshot


def build_output_audit_snapshot(event_type: str, source: Any) -> Dict[str, Any]:
    data = _as_dict(source)
    snapshot = _base_snapshot(event_type)
    snapshot["request_status"] = "succeeded"

    if event_type == "money_value_quick_check":
        snapshot.update({
            "result_state": "flags_present" if data.get("flags") else "no_flags",
            "reason_codes": list(data.get("flags", [])),
            "explanation_present": bool(data.get("explanation")),
        })
        return snapshot

    if event_type == "money_value_check":
        snapshot.update({
            "reward_type": data.get("reward_type"),
            "rewards_mode": data.get("reward_input_basis"),
            "reward_period": data.get("reward_period"),
            "interest_mode": data.get("interest_input_basis"),
            "reward_value_known": bool(data.get("reward_value_known", False)),
            "interest_value_known": bool(data.get("interest_value_known", False)),
            "unknown_value_reason": data.get("unknown_value_reason"),
            "value_status": data.get("value_status"),
            "reason_codes": list(data.get("reason_codes", [])),
        })
        return snapshot

    if event_type == "borrow_better_quick_check":
        snapshot.update({
            "decision": data.get("decision"),
            "reason_codes": list(data.get("reason_codes", [])),
            "explanation_present": bool(data.get("explanation")),
        })
        return snapshot

    if event_type == "comfortable_borrowing_check":
        snapshot.update({
            "comfort_status": data.get("comfort_status"),
            "reason_codes": list(data.get("reason_codes", [])),
            "guidance_disclaimer_present": bool(data.get("guidance_disclaimer")),
            "next_best_action_present": bool(data.get("next_best_action")),
        })
        return snapshot

    return snapshot


def _sanitize_snapshot(kind: str, event_type: str, snapshot: Any) -> Dict[str, Any]:
    if kind == "input":
        return build_input_audit_snapshot(event_type, snapshot)
    return build_output_audit_snapshot(event_type, snapshot)


def record_audit_event(
    event_type: str,
    policy_version: str,
    input_snapshot: Dict[str, Any],
    output_snapshot: Dict[str, Any],
    decision_context: str = "local_demo",
) -> Dict[str, Any]:
    """Append a local JSONL audit event and return it.

    Alpha note: replace with encrypted DB/S3 append-only logging after G0.5 security review.
    Do not log PAN/account numbers/raw statement lines here.
    """
    created_at = datetime.now(timezone.utc).isoformat()
    event = {
        "audit_event_id": str(uuid.uuid4()),
        "audit_schema_version": AUDIT_SCHEMA_VERSION,
        "event_type": event_type,
        "created_at": created_at,
        "event_time_utc": created_at,
        "policy_version": policy_version,
        "decision_context": decision_context,
        "input_snapshot": _sanitize_snapshot("input", event_type, input_snapshot),
        "output_snapshot": _sanitize_snapshot("output", event_type, output_snapshot),
    }
    return audit_store().append(event)
