from functools import lru_cache
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
DECISION_ENGINE_PATH = ROOT / "decision_engine"
sys.path.append(str(DECISION_ENGINE_PATH))

from decision_engine import DecisionEngine  # noqa: E402


@lru_cache
def borrow_better_engine() -> DecisionEngine:
    policy_path = DECISION_ENGINE_PATH / "decision_engine" / "rules" / "borrow_better_v0_1.json"
    return DecisionEngine.from_json_file(policy_path)
