"""Rutas de reglas recurrentes. `run` genera las transacciones vencidas."""

import uuid
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import recurring as crud
from app.db import get_session
from app.schemas.recurring import (
    RecurringCreate,
    RecurringRead,
    RecurringRunResult,
    RecurringUpdate,
)
from app.services.reports import DEFAULT_TZ

router = APIRouter(prefix="/recurring", tags=["recurring"])

_NOT_FOUND = "Regla recurrente no encontrada"


@router.post("", response_model=RecurringRead, status_code=status.HTTP_201_CREATED)
async def create_recurring(
    data: RecurringCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> RecurringRead:
    try:
        return await crud.create_recurring(session, owner_id, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.get("", response_model=list[RecurringRead])
async def list_recurring(
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> list[RecurringRead]:
    return await crud.list_recurring(session, owner_id)


@router.post("/run", response_model=RecurringRunResult)
async def run_recurring(
    as_of: date | None = None,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> RecurringRunResult:
    if as_of is None:
        as_of = datetime.now(ZoneInfo(DEFAULT_TZ)).date()
    ids = await crud.run_due(session, owner_id, as_of)
    return RecurringRunResult(generated=len(ids), transaction_ids=ids)


@router.get("/{rule_id}", response_model=RecurringRead)
async def get_recurring(
    rule_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> RecurringRead:
    rule = await crud.get_recurring(session, owner_id, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return rule


@router.patch("/{rule_id}", response_model=RecurringRead)
async def update_recurring(
    rule_id: uuid.UUID,
    data: RecurringUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> RecurringRead:
    rule = await crud.get_recurring(session, owner_id, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return await crud.update_recurring(session, rule, data)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_recurring(
    rule_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    rule = await crud.get_recurring(session, owner_id, rule_id)
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_recurring(session, rule)
