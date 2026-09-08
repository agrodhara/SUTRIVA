from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "sutriva-product-api", "version": "0.1.0"}


app.include_router(borrowing_intelligence.router)
app.include_router(borrow_better.router)
app.include_router(money_value.router)
app.include_router(financial_intelligence.router)
app.include_router(product_events.router)
