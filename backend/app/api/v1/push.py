"""Rutas de las notificaciones push (1.4.0).

Se justifican como endpoints (no se leen del SQLite del dispositivo): la
suscripcion es estado del servidor que no se sincroniza, y mandar un push solo
lo puede hacer el servidor. La clave publica es configuracion del servidor.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.config import settings
from app.crud import push as crud
from app.db import get_session
from app.schemas.push import (
    PushConfigRead,
    PushEndpoint,
    PushPruebaRead,
    PushSubscriptionCreate,
    PushSubscriptionRead,
)
from app.services import push as servicio

router = APIRouter(prefix="/push", tags=["push"])

_SIN_PUSH = HTTPException(
    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
    detail="El servidor no tiene push configurado",
)


@router.get("/config", response_model=PushConfigRead)
async def config(_: uuid.UUID = Depends(get_current_user_id)) -> PushConfigRead:
    disponible = servicio.configurado()
    return PushConfigRead(
        disponible=disponible, clave_publica=settings.vapid_public_key if disponible else None
    )


@router.post(
    "/subscriptions", response_model=PushSubscriptionRead, status_code=status.HTTP_201_CREATED
)
async def suscribir(
    data: PushSubscriptionCreate,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> PushSubscriptionRead:
    if not servicio.configurado():
        raise _SIN_PUSH
    sub = await crud.guardar(session, user_id, data)
    if sub is None:
        # El endpoint es de otra persona y trae otras claves: no es su
        # navegador. 404 y no 403: no se confirma que un endpoint ajeno exista.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint no disponible")
    return sub


@router.delete("/subscriptions", status_code=status.HTTP_204_NO_CONTENT)
async def dar_de_baja(
    data: PushEndpoint,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> None:
    # 404 y no 403: no se confirma que un endpoint ajeno exista.
    sub = await crud.de_endpoint(session, user_id, data.endpoint)
    if sub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No esta suscripto")
    await crud.dar_de_baja(session, sub)


@router.post("/test", response_model=PushPruebaRead)
async def probar(
    data: PushEndpoint,
    session: AsyncSession = Depends(get_session),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> PushPruebaRead:
    """Un aviso de prueba a ESTE dispositivo, para ver que llega."""
    if not servicio.configurado():
        raise _SIN_PUSH
    if await crud.de_endpoint(session, user_id, data.endpoint) is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No esta suscripto")
    mensaje = {
        "id": str(uuid.uuid4()),
        "titulo": "Mango · Prueba",
        "cuerpo": "Si ves esto, los avisos llegan a este dispositivo.",
        "link": "/ajustes",
        "tag": "prueba",
        "icono": servicio.ICONO,
        "insignia": servicio.INSIGNIA,
    }
    enviados = await servicio.enviar(session, user_id, mensaje, None, endpoint=data.endpoint)
    await session.commit()
    return PushPruebaRead(enviados=enviados)
