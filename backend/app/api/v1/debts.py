"""Rutas de deudas y prestamos (fase 5)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import debt as crud
from app.db import get_session
from app.schemas.debt import DebtCreate, DebtRead, DebtUpdate

router = APIRouter(prefix="/debts", tags=["debts"])

_NOT_FOUND = "Deuda no encontrada"


@router.post("", response_model=DebtRead, status_code=status.HTTP_201_CREATED)
async def create_debt(
    data: DebtCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> DebtRead:
    return await crud.create_debt(session, owner_id, data)


@router.patch("/{debt_id}", response_model=DebtRead)
async def update_debt(
    debt_id: uuid.UUID,
    data: DebtUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> DebtRead:
    debt = await crud.get_debt(session, owner_id, debt_id)
    if debt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    try:
        return await crud.update_debt(session, debt, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.delete("/{debt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_debt(
    debt_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    debt = await crud.get_debt(session, owner_id, debt_id)
    if debt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_debt(session, debt)
