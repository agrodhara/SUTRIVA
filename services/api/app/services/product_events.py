from __future__ import annotations

import json
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict


def record_product_event(event_type: str, journey: str, decision_context: str = "local_demo") -> Dict[str, str]:
    """Append a minimal local product-learning event.

    Alpha note: this is a lightweight, local-only event log for product learning.
    It intentionally never stores names, contact details, account details or
    raw financial-check inputs. Replace with a proper analytics-free event
    pipeline only if/when a governance review approves one.
    """
    path = Path(os.getenv("PRODUCT_EVENT_LOG_PATH", str(Path(tempfile.gettempdir()) / "sutriva" / "product_events.jsonl")))
    path.parent.mkdir(parents=True, exist_ok=True)
    event = {
        "event_id": str(uuid.uuid4()),
        "event_type": event_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "journey": journey,
        "decision_context": decision_context,
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return event
