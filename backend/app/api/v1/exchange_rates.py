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
    """Completa la serie de cotizaciones y trae lo del dia (0031). La serie es
    de todos; la respuesta habla de las monedas de las cuentas del usuario.

    La app lo pide al abrir: si recien se hizo una vuelta, no sale a la red.
    `forzar` (el boton "Actualizar ahora") sale igual.

    Nunca falla por la red: lo que no se pudo traer sale en `fallidas` y la app
    sigue con lo que ya tenia (ver 0005)."""
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
    try:
        return await crud.update_rate(session, rate, data)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc


@router.delete("/{rate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rate(
    rate_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: uuid.UUID = Depends(get_current_user_id),
) -> None:
    rate = await crud.get_rate(session, rate_id, incluso_borrado=True)
    if rate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    # Idempotente (1.7.0): lo ya borrado da 204, no un 404 que iria a
    # "Rechazados". Lo ajeno sigue en 404.
    if rate.deleted_at is not None:
        return
    try:
        await crud.soft_delete_rate(session, rate)
    except DomainError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)
        ) from exc
