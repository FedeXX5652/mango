"""Rutas de avisos in-app (fase 3b, ver 0019). Se LEEN por la sync; aca solo se
marcan leidos. Crearlos o borrarlos no es cosa del cliente (los genera el server)."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.crud import notification as crud
from app.db import get_session
from app.schemas.notification import NotificationRead, NotificationUpdate

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_read(
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    await crud.marcar_todas_leidas(session, user_id)


@router.patch("/{notif_id}", response_model=NotificationRead)
async def mark_read(
    notif_id: uuid.UUID,
    _: NotificationUpdate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> NotificationRead:
    aviso = await crud.get_notification(session, user_id, notif_id)
    if aviso is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Aviso no encontrado")
    return await crud.marcar_leida(session, aviso)
