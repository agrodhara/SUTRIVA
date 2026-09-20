from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class AnonymousSessionBootstrapResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_status: Literal["created", "continued"]
    absolute_expires_at: datetime
    cookie_max_age_seconds: int