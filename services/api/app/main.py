from fastapi import FastAPI

from app.routers import borrow_better, borrowing_intelligence, financial_intelligence, money_value

app = FastAPI(
    title="Sutriva Product API",
    version="0.1.0",
    description="Alpha API for Personal Financial Intelligence quick-value journeys.",
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "sutriva-product-api", "version": "0.1.0"}


app.include_router(borrowing_intelligence.router)
app.include_router(borrow_better.router)
app.include_router(money_value.router)
app.include_router(financial_intelligence.router)
