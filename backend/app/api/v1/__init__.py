from fastapi import APIRouter

from app.api.v1.accounts import router as accounts_router
from app.api.v1.categories import router as categories_router
from app.api.v1.payment_methods import router as payment_methods_router

# Router raiz de la v1. Cada recurso registra el suyo aca (ver skill nuevo-endpoint).
api_router = APIRouter()
api_router.include_router(accounts_router)
api_router.include_router(categories_router)
api_router.include_router(payment_methods_router)
