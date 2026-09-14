"""Ruta del propio usuario. Fase 1: siempre el usuario semilla (sin auth).

La fila viaja al dispositivo por la sincronizacion (con las columnas contadas,
ver infra/powersync/sync-config.yaml), asi que el cliente **la lee de su base
local**, no de aca. Lo unico que sube por REST es el PATCH que produce esa misma
sincronizacion cuando se cambia una preferencia.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.crud import user as crud
from app.db import get_session
from app.models.user import User
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    data: UserUpdate,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> UserRead:
    # Solo el propio. 404 y no 403: no se revela que ese usuario exista, igual
    # que en el resto de los recursos.
    if user_id != current.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuario no encontrado")
    return await crud.update_user(session, current, data)
