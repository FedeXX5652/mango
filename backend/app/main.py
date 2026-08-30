from fastapi import FastAPI

from app.api.v1 import api_router

app = FastAPI(title="Mango API", version="0.1.0")

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["infra"])
async def health() -> dict[str, str]:
    """Sonda de vida. No toca la base."""
    return {"status": "ok"}
