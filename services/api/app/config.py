from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict


def _config_path() -> Path:
    return Path(__file__).resolve().parents[3] / "shared" / "track11_config.json"


@lru_cache(maxsize=1)
def track11_config() -> Dict[str, Any]:
    with _config_path().open("r", encoding="utf-8") as handle:
        return json.load(handle)


def borrow_illustrative_annual_rate_percent() -> float:
    return float(track11_config()["borrowIllustrativeAnnualRatePercent"])


def borrow_illustrative_annual_rate_fraction() -> float:
    return borrow_illustrative_annual_rate_percent() / 100


def track11a_enabled() -> bool:
    return bool(track11_config()["track11aEnabled"])


def track11b_enabled() -> bool:
    return bool(track11_config()["track11bEnabled"])


def track11_version() -> str:
    return str(track11_config()["track11Version"])