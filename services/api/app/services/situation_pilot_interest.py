from __future__ import annotations

import logging
from datetime import datetime
from typing import Literal

from sqlalchemy.exc import SQLAlchemyError

from app.db.config import DatabaseConfigError, DatabaseNotConfiguredError, get_database_settings
from app.db.session import session_scope
from app.repositories.situation_pilot_interest import insert_situation_pilot_interest, list_situation_pilot_interest
from app.repositories.situation_pilot_interest import PilotInterestAdminRecord

LOGGER = logging.getLogger(__name__)

BORROW_SITUATION_KEYS = ("debt", "purchase", "offer", "rejected")
REWARDS_SITUATION_KEYS = ("fee", "fit", "balance", "multi", "unused")

# The single source mapping a short situation key to its journey — derived server-side so a caller can
# never desynchronize the two (see app/models/situation_pilot_interest.py's PilotInterestEmailRequest).
SITUATION_JOURNEY: dict[str, str] = {
    **{key: "comfortable_borrowing" for key in BORROW_SITUATION_KEYS},
    **{key: "money_value" for key in REWARDS_SITUATION_KEYS},
}


class SituationPilotInterestError(Exception):
    def __init__(self, status_code: int, code: str) -> None:
        super().__init__(code)
        self.status_code = status_code
        self.code = code


def register_pilot_interest(
    *,
    situation_key: str,
    email: str,
    anonymous_session_uuid: str | None,
) -> Literal["registered", "already_registered"]:
    """Persists the visitor's email against the situation they explored. `email` must already be
    normalized (stripped, lowercased) by the caller — see PilotInterestEmailRequest.validate_and_normalize_email
    — this function does not re-normalize it, so the database's ck_situation_pilot_interest_email_normalized
    check constraint is the last line of defense against an un-normalized value ever landing here.

    Raises SituationPilotInterestError(503, "service_unavailable") if the database is not reachable or not
    configured — this must propagate as a real error, not a fabricated success: the caller (see
    app/routers/situation_pilot_interest.py) must never let the visitor see the agreed success copy for a
    submission that was not actually saved.
    """
    journey = SITUATION_JOURNEY[situation_key]
    settings = get_database_settings()
    try:
        with session_scope(settings) as db:
            inserted = insert_situation_pilot_interest(
                db,
                journey=journey,
                situation_key=situation_key,
                email=email,
                anonymous_session_uuid=anonymous_session_uuid,
            )
    except (DatabaseConfigError, DatabaseNotConfiguredError, SQLAlchemyError) as exc:
        LOGGER.warning("situation pilot interest registration unavailable", extra={"category": "situation_pilot_interest_db_error"})
        raise SituationPilotInterestError(503, "service_unavailable") from exc
    return "registered" if inserted else "already_registered"


def list_pilot_interest_for_admin(*, limit: int, before: datetime | None) -> list[PilotInterestAdminRecord]:
    """Operator-only retrieval (see app/routers/situation_pilot_interest.py's admin export route, which
    gates this behind a configured secret token). Raises SituationPilotInterestError(503, ...) the same
    way register_pilot_interest does if the database is unavailable."""
    settings = get_database_settings()
    try:
        with session_scope(settings) as db:
            return list_situation_pilot_interest(db, limit=limit, before=before)
    except (DatabaseConfigError, DatabaseNotConfiguredError, SQLAlchemyError) as exc:
        LOGGER.warning("situation pilot interest export unavailable", extra={"category": "situation_pilot_interest_db_error"})
        raise SituationPilotInterestError(503, "service_unavailable") from exc
