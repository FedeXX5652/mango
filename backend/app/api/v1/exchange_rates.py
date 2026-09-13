"""Rutas de cotizaciones (ver decision 0005).

Las cotizaciones no son de un usuario: son datos de mercado. Igual la ruta pide
usuario, para no dejar una entrada sin identificar cuando llegue la auth real.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import fx as crud
from app.db import get_session
from app.schemas.fx import (
    ExchangeRateCreate,
    ExchangeRateRead,
    ExchangeRateUpdate,
    RefrescoRead,
)
from app.services import fx as servicio_fx

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])

_NOT_FOUND = "Cotizacion no encontrada"


@router.post("", response_model=ExchangeRateRead, status_code=status.HTTP_201_CREATED)
async def create_rate(
    data: ExchangeRateCreate,
    session: AsyncSession = Depends(get_session),
    _: uuid.UUID = Depends(get_current_user_id),
) -> ExchangeRateRead:
    try:
        return await crud.create_rate(session, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.post("/refresh", response_model=RefrescoRead)
async def refresh_rates(
    forzar: bool = False,
    session: AsyncSession = Depends(get_session),
    owner_id: uuid.UUID = Depends(get_current_user_id),
) -> RefrescoRead:
    """Trae la cotizacion de cada moneda del usuario contra su moneda base.

    Idempotente por fecha: la fuente publica una por dia, asi que llamarlo al
    abrir la app no gasta una llamada por vez. `forzar` reescribe la del dia.

    Nunca falla por la red: lo que no se pudo traer sale en `fallidas` y la app
    sigue con lo que ya tenia (la cotizacion cacheada sirve para estimar, ver
    0005)."""
    res = await servicio_fx.refrescar(session, owner_id, forzar=forzar)
    return RefrescoRead(**vars(res))


@router.patch("/{rate_id}", response_model=ExchangeRateRead)
async def update_rate(
    rate_id: uuid.UUID,
    data: ExchangeRateUpdate,
    session: AsyncSession = Depends(get_session),
    _: uuid.UUID = Depends(get_current_user_id),
) -> ExchangeRateRead:
    rate = await crud.get_rate(session, rate_id)
    if rate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return await crud.update_rate(session, rate, data)


@router.delete("/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rate(
    rate_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: uuid.UUID = Depends(get_current_user_id),
) -> None:
    rate = await crud.get_rate(session, rate_id)
    if rate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    await crud.soft_delete_rate(session, rate)
