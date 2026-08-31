from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import api_router
from app.core.config import settings

app = FastAPI(title="Mango API", version="0.1.0")

# El frontend corre en otro origen (Vite dev/preview); sin CORS el navegador
# bloquea las llamadas. Los origenes permitidos se configuran por entorno.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/health", tags=["infra"])
async def health() -> dict[str, str]:
    """Sonda de vida. No toca la base."""
    return {"status": "ok"}
