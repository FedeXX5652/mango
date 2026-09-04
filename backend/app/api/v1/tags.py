"""Rutas de etiquetas y de su asociacion a movimientos (ver 3.5.1)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import tag as crud
from app.db import get_session
from app.schemas.tag import (
    TagCreate,
    TagRead,
    TagUpdate,
    TransactionTagCreate,
    TransactionTagRead,
)

router = APIRouter(prefix="/tags", tags=["tags"])
router_tt = APIRouter(prefix="/transaction-tags", tags=["tags"])

_NOT_FOUND = "Etiqueta no encontrada"


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED)
async def create_tag(
    data: TagCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TagRead:
    try:
        return await crud.create_tag(session, owner_id, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.get("", response_model=list[TagRead])
async def list_tags(
    include_archived: bool = True,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> list[TagRead]:
    return await crud.list_tags(session, owner_id, include_archived=include_archived)


@router.get("/{tag_id}", response_model=TagRead)
async def get_tag(
    tag_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TagRead:
    tag = await crud.get_tag(session, owner_id, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return tag


@router.patch("/{tag_id}", response_model=TagRead)
async def update_tag(
    tag_id: uuid.UUID,
    data: TagUpdate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TagRead:
    tag = await crud.get_tag(session, owner_id, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    try:
        return await crud.update_tag(session, owner_id, tag, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    tag = await crud.get_tag(session, owner_id, tag_id)
    if tag is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_tag(session, tag)


@router_tt.post("", response_model=TransactionTagRead, status_code=status.HTTP_201_CREATED)
async def create_transaction_tag(
    data: TransactionTagCreate,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> TransactionTagRead:
    try:
        return await crud.create_transaction_tag(session, owner_id, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router_tt.delete("/{tt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_transaction_tag(
    tt_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    tt = await crud.get_transaction_tag(session, owner_id, tt_id)
    if tt is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Asociacion no encontrada"
        )
    await crud.soft_delete_transaction_tag(session, tt)
