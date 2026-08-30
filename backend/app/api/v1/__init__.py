from fastapi import APIRouter

from app.api.v1.accounts import router as accounts_router
from app.api.v1.budgets import router as budgets_router
from app.api.v1.categories import router as categories_router
from app.api.v1.payment_methods import router as payment_methods_router
from app.api.v1.recurring import router as recurring_router
from app.api.v1.reports import router as reports_router
from app.api.v1.templates import router as templates_router
from app.api.v1.transactions import router as transactions_router
from app.api.v1.users import router as users_router

# Router raiz de la v1. Cada recurso registra el suyo aca (ver skill nuevo-endpoint).
api_router = APIRouter()
api_router.include_router(accounts_router)
api_router.include_router(categories_router)
api_router.include_router(payment_methods_router)
api_router.include_router(transactions_router)
api_router.include_router(reports_router)
api_router.include_router(budgets_router)
api_router.include_router(templates_router)
api_router.include_router(recurring_router)
api_router.include_router(users_router)
