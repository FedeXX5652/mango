"""Dependencias compartidas de la API.

Fase 1: un solo usuario, sin auth de servidor. `get_current_user` resuelve
siempre al usuario semilla. Cuando llegue la auth real (fase 3), se cambia
aca sin tocar los endpoints que dependen de esto.
"""

import uuid

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import get_session
from app.models.user import User


def get_current_user_id() -> uuid.UUID:
    """El owner de todo lo que se crea en fase 1. No toca la base."""
    return settings.seed_user_id


async def get_current_user(session: AsyncSession = Depends(get_session)) -> User:
    """El usuario semilla, cargado de la base.

    Si falta, es un error de arranque (no se corrio la semilla), no del cliente:
    503, no 401.
    """
    user = await session.get(User, settings.seed_user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Usuario semilla ausente. Corre: python -m app.seed",
        )
    return user
