import logging
import os

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.db.readiness import get_readiness_status
from app.session_config import get_anonymous_session_settings
from app.routers import (
    anonymous_sessions,
    borrow_better,
    borrowing_intelligence,
    financial_intelligence,
    money_value,
    pilot,
    product_events,
    saved_borrow_checks,
    situation_pilot_interest,
    situations,
)

app = FastAPI(
    title="Sutriva Product API",
    version="0.1.0",
    description="Alpha API for Personal Financial Intelligence quick-value journeys.",
)

# Milestone 2 (round 3): without this, app/services/saved_borrow_checks.py's INFO-level measurement log
# lines (and every other sub-WARNING log call anywhere in this codebase) produce **no output at all** in
# a real run — confirmed directly, not assumed, by running the actual server and capturing its real
# stdout: nothing in this application calls logging.basicConfig or configures any handler anywhere, so
# Python's root logger has no handler and its default level (WARNING) suppresses INFO regardless. This
# configures a handler and INFO level scoped to exactly the one logger this round's measurement work
# needs — not the root logger — so third-party libraries (SQLAlchemy, uvicorn's own loggers, etc.) are
# not made more verbose as a side effect of this fix.
logging.getLogger("app.services.saved_borrow_checks").setLevel(logging.INFO)
if not logging.getLogger("app.services.saved_borrow_checks").handlers:
    _measurement_handler = logging.StreamHandler()
    _measurement_handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.getLogger("app.services.saved_borrow_checks").addHandler(_measurement_handler)

allowed_origins = list(get_anonymous_session_settings().allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # DELETE added for the Milestone 2C saved-check withdrawal route
    # (app/routers/saved_borrow_checks.py) — every other route here still only ever uses GET/POST, so
    # this is purely additive, not a widening of what any existing route accepts.
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "sutriva-product-api", "version": "0.1.0"}


@app.get("/ready")
def ready() -> JSONResponse:
    status = get_readiness_status()
    status_code = 200 if status["status"] == "ok" else 503
    return JSONResponse(status_code=status_code, content=status)


app.include_router(anonymous_sessions.router)
app.include_router(borrowing_intelligence.router)
app.include_router(borrow_better.router)
app.include_router(money_value.router)
app.include_router(financial_intelligence.router)
app.include_router(product_events.router)
app.include_router(pilot.router)
app.include_router(situations.borrow_router)
app.include_router(situations.rewards_router)
app.include_router(situation_pilot_interest.router)
app.include_router(saved_borrow_checks.router)
