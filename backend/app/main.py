from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.v1 import api_router
from app.core.config import settings

app = FastAPI(title="Mango API", version="0.1.0")


@app.exception_handler(IntegrityError)
async def _integrity_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    # Reintento de subida de PowerSync con un id ya insertado -> conflicto, no
    # error del servidor. Devolver 409 permite que el cliente lo trate como
    # 'ya aplicado' y no reintente en loop.
    return JSONResponse(
        status_code=status.HTTP_409_CONFLICT,
        content={"detail": "Conflicto de integridad (posible duplicado)"},
    )


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
