"""Rutas de las partes de un gasto compartido (fase 3b.3, ver 0015)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import split as crud
from app.db import get_session
from app.schemas.split import SplitCreate, SplitRead, SplitUpdate

router = APIRouter(prefix="/transaction-splits", tags=["splits"])

_NOT_FOUND = "Parte no encontrada"


def _422(exc: DomainError) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


@router.post("", response_model=SplitRead, status_code=status.HTTP_201_CREATED)
async def create_split(
    data: SplitCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> SplitRead:
    try:
        return await crud.create_split(session, owner_id, data)
    except DomainError as exc:
        raise _422(exc) from exc


@router.patch("/{split_id}", response_model=SplitRead)
async def update_split(
    split_id: uuid.UUID,
    data: SplitUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> SplitRead:
    split = await crud.get_split(session, owner_id, split_id)
    if split is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return await crud.update_split(session, split, data)


@router.delete("/{split_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_split(
    split_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    split = await crud.get_split(session, owner_id, split_id)
    if split is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_split(session, split)
