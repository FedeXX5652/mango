"""Rutas de pagos entre miembros para saldar (fase 3b.3, ver 0015)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import settlement as crud
from app.db import get_session
from app.schemas.settlement import SettlementCreate, SettlementRead

router = APIRouter(prefix="/settlements", tags=["settlements"])


@router.post("", response_model=SettlementRead, status_code=status.HTTP_201_CREATED)
async def create_settlement(
    data: SettlementCreate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> SettlementRead:
    try:
        return await crud.create_settlement(session, user_id, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.delete("/{settlement_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_settlement(
    settlement_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    pago = await crud.get_settlement(session, user_id, settlement_id)
    if pago is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pago no encontrado")
    await crud.soft_delete_settlement(session, pago)
