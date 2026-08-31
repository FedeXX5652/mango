"""Rutas de asignaciones a sobres. CRUD plano; el calculo vive en el cliente."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import budget as crud
from app.db import get_session
from app.schemas.budget import BudgetCreate, BudgetRead, BudgetUpdate

router = APIRouter(prefix="/budgets", tags=["budgets"])

_NOT_FOUND = "Presupuesto no encontrado"


@router.post("", response_model=BudgetRead, status_code=status.HTTP_201_CREATED)
async def create_budget(
    data: BudgetCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> BudgetRead:
    try:
        return await crud.create_budget(session, owner_id, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.get("", response_model=list[BudgetRead])
async def list_budgets(
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> list[BudgetRead]:
    return await crud.list_budgets(session, owner_id)


@router.get("/{budget_id}", response_model=BudgetRead)
async def get_budget(
    budget_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> BudgetRead:
    budget = await crud.get_budget(session, owner_id, budget_id)
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return budget


@router.patch("/{budget_id}", response_model=BudgetRead)
async def update_budget(
    budget_id: uuid.UUID,
    data: BudgetUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> BudgetRead:
    budget = await crud.get_budget(session, owner_id, budget_id)
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return await crud.update_budget(session, budget, data)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    budget = await crud.get_budget(session, owner_id, budget_id)
    if budget is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_budget(session, budget)
