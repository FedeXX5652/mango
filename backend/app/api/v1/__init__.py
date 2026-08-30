from fastapi import APIRouter

from app.api.v1.accounts import router as accounts_router

# Router raiz de la v1. Cada recurso registra el suyo aca (ver skill nuevo-endpoint).
api_router = APIRouter()
api_router.include_router(accounts_router)
