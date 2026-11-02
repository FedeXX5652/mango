import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.api.v1 import api_router
from app.core.config import settings
from app.services import planificador


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """El planificador (1.4.0) vive lo que vive la app: push y cotizacion
    diaria sin que nadie abra nada."""
    tarea = asyncio.create_task(planificador.correr()) if settings.planificador_activo else None
    yield
    if tarea is not None:
        tarea.cancel()
        with suppress(asyncio.CancelledError):
            await tarea


app = FastAPI(title="Mango API", version="0.1.0", lifespan=lifespan)


def _es_id_repetido(exc: IntegrityError) -> bool:
    """Un INSERT con un id que ya existe: la clave primaria (`<tabla>_pkey`)."""
    orig = getattr(exc, "orig", None)
    causa = getattr(orig, "__cause__", None) or orig
    estado = getattr(causa, "sqlstate", None) or getattr(orig, "sqlstate", None)
    restriccion = (
        getattr(causa, "constraint_name", None) or getattr(orig, "constraint_name", None) or ""
    )
    return estado == "23505" and restriccion.endswith("_pkey")


@app.exception_handler(IntegrityError)
async def _integrity_handler(request: Request, exc: IntegrityError) -> JSONResponse:
    # Un reintento de subida de PowerSync con un id ya insertado es 409: el
    # cliente lo toma por 'ya aplicado' y no reintenta en loop. CUALQUIER otra
    # violacion es un rechazo (422): como 409 se perdia sin aviso, y 0011 pide
    # que ningun cambio se pierda en silencio (va a "Cambios que no se guardaron").
    if _es_id_repetido(exc):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": "Ya estaba guardado"},
        )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        content={"detail": "El cambio choca con otro dato que ya está guardado"},
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
