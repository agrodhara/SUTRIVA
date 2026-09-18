from __future__ import annotations

import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


def runtime_storage_dir() -> Path:
    return Path(tempfile.gettempdir()) / "sutriva"


def audit_log_path() -> Path:
    return Path(os.getenv("AUDIT_LOG_PATH", str(runtime_storage_dir() / "audit_events.jsonl")))


def product_event_log_path() -> Path:
    return Path(os.getenv("PRODUCT_EVENT_LOG_PATH", str(runtime_storage_dir() / "product_events.jsonl")))


@dataclass
class LocalJsonlStore:
    path: Path

    def append(self, record: Dict[str, Any]) -> Dict[str, Any]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record


class LocalIdempotentEventStore(LocalJsonlStore):
    def record(self, event: Dict[str, Any]) -> Dict[str, Any]:
        if self.path.exists():
            with self.path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    raw = line.strip()
                    if not raw:
                        continue
                    existing = json.loads(raw)
                    if existing.get("event_id") == event.get("event_id"):
                        return existing
        return self.append(event)


def audit_store() -> LocalJsonlStore:
    return LocalJsonlStore(audit_log_path())


def product_event_store() -> LocalIdempotentEventStore:
    return LocalIdempotentEventStore(product_event_log_path())