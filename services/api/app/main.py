from fastapi import FastAPI

app = FastAPI(title="Sutriva API")


@app.get("/health")
def health():
    return {"status": "ok", "service": "sutriva-api", "environment": "local"}
