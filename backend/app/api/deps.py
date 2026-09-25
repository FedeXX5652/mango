"""Dependencias compartidas de la API.

Fase 3a: auth real. El cliente manda `Authorization: Bearer <token>` con la
sesion que le dio el login; estas dependencias lo leen y resuelven el usuario.
Sin token valido, 401.

Las pruebas de la API sobreescriben `get_current_user_id`/`get_current_user`
enteras (ver conftest), asi que no mandan token: ese camino solo lo ejercitan
las pruebas de auth.
"""

import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.sesion import leer_sesion
from app.db import get_session
from app.models.user import User

_NO_AUTORIZADO = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="No autenticado",
    headers={"WWW-Authenticate": "Bearer"},
)


def _token_de(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise _NO_AUTORIZADO
    return authorization[7:].strip()


def get_current_user_id(authorization: str | None = Header(default=None)) -> uuid.UUID:
    """Id del usuario de la sesion. No toca la base: sirve para los endpoints
    que solo necesitan el owner (la mayoria de las escrituras)."""
    user_id = leer_sesion(_token_de(authorization))
    if user_id is None:
        raise _NO_AUTORIZADO
    return user_id


async def get_current_user(
    authorization: str | None = Header(default=None),
    session: AsyncSession = Depends(get_session),
) -> User:
    """El usuario de la sesion, cargado de la base. Para lo que necesita mas que
    el id (cambiar la clave, leer `must_change_password`)."""
    user_id = leer_sesion(_token_de(authorization))
    if user_id is None:
        raise _NO_AUTORIZADO
    user = await session.get(User, user_id)
    if user is None:
        # Token valido de un usuario que ya no existe (borrado). No es 503: es
        # una sesion que dejo de valer.
        raise _NO_AUTORIZADO
    return user
