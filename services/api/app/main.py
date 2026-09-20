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
    product_events,
)

app = FastAPI(
    title="Sutriva Product API",
    version="0.1.0",
    description="Alpha API for Personal Financial Intelligence quick-value journeys.",
)

allowed_origins = list(get_anonymous_session_settings().allowed_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["GET", "POST", "OPTIONS"],
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
