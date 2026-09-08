from __future__ import annotations

import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def record_audit_event(
    event_type: str,
    policy_version: str,
    input_snapshot: Dict[str, Any],
    output_snapshot: Dict[str, Any],
    decision_context: str = "local_demo",
) -> str:
    """Append a local JSONL audit event and return its generated audit_event_id.

    Alpha note: replace with encrypted DB/S3 append-only logging after G0.5 security review.
    Do not log PAN/account numbers/raw statement lines here.
    """
    audit_event_id = str(uuid.uuid4())
    path = Path(os.getenv("AUDIT_LOG_PATH", "./audit_events.jsonl"))
    event = {
        "audit_event_id": audit_event_id,
        "event_type": event_type,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "policy_version": policy_version,
        "decision_context": decision_context,
        "input_snapshot": input_snapshot,
        "output_snapshot": output_snapshot,
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
    return audit_event_id
