"""Rutas de saldos y estadisticas (solo lectura)."""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.db import get_session
from app.schemas.reports import BalancesResponse, CategoryTotal, MonthlyRow
from app.services import reports

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/balances", response_model=BalancesResponse)
async def balances(
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> BalancesResponse:
    return await reports.account_balances(session, owner_id)


@router.get("/by-category", response_model=list[CategoryTotal])
async def by_category(
    kind: Literal["expense", "income"] = "expense",
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> list[CategoryTotal]:
    return await reports.totals_by_category(
        session, owner_id, kind=kind, date_from=date_from, date_to=date_to
    )


@router.get("/monthly", response_model=list[MonthlyRow])
async def monthly(
    tz: str = reports.DEFAULT_TZ,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> list[MonthlyRow]:
    return await reports.monthly_evolution(
        session, owner_id, tz=tz, date_from=date_from, date_to=date_to
    )
