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
@dataclass
class LocalJsonlStore:
    path: Path

    def append(self, record: Dict[str, Any]) -> Dict[str, Any]:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
        return record
def audit_store() -> LocalJsonlStore:
    return LocalJsonlStore(audit_log_path())