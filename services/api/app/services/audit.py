from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict


def record_audit_event(event_type: str, policy_version: str, input_snapshot: Dict[str, Any], output_snapshot: Dict[str, Any]) -> None:
    """Append a local JSONL audit event.

    Alpha note: replace with encrypted DB/S3 append-only logging after G0.5 security review.
    Do not log PAN/account numbers/raw statement lines here.
    """
    path = Path(os.getenv("AUDIT_LOG_PATH", "./audit_events.jsonl"))
    event = {
        "event_time_utc": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "policy_version": policy_version,
        "input_snapshot": input_snapshot,
        "output_snapshot": output_snapshot,
    }
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(event, ensure_ascii=False) + "\n")
