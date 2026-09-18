from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.services.storage import product_event_store


def record_product_event(
    event_id: str,
    event_type: str,
    anonymous_session_id: str,
    journey_run_id: str,
    journey: str,
    version: str,
    timestamp: str,
    decision_context: str = "local_demo",
    card_check_number: Optional[int] = None,
    first_touch_attribution: Optional[Dict[str, Any]] = None,
    latest_touch_attribution: Optional[Dict[str, Any]] = None,
    intent: Optional[str] = None,
    reason: Optional[str] = None,
) -> Dict[str, Any]:
    """Append a minimal local product-learning event.

    Alpha note: this is a lightweight, local-only event log for product learning.
    It intentionally never stores names, contact details, account details or
    raw financial-check inputs. Replace with a proper analytics-free event
    pipeline only if/when a governance review approves one.
    """
    event = {
        "event_id": event_id,
        "event_type": event_type,
        "anonymous_session_id": anonymous_session_id,
        "journey_run_id": journey_run_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "version": version,
        "timestamp": timestamp,
        "journey": journey,
        "decision_context": decision_context,
        "card_check_number": card_check_number,
        "first_touch_attribution": first_touch_attribution,
        "latest_touch_attribution": latest_touch_attribution,
        "intent": intent,
        "reason": reason,
    }
    return product_event_store().record(event)
