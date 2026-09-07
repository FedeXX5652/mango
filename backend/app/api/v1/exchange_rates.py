"""Rutas de cotizaciones (ver decision 0005).

Las cotizaciones no son de un usuario: son datos de mercado. Igual la ruta pide
usuario, para no dejar una entrada sin identificar cuando llegue la auth real.
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_id
from app.core.errors import DomainError
from app.crud import fx as crud
from app.db import get_session
from app.schemas.fx import ExchangeRateCreate, ExchangeRateRead, ExchangeRateUpdate

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


@router.get("", response_model=list[ExchangeRateRead])
async def list_rates(
    base_currency: str | None = None,
    quote_currency: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    limit: int = Query(default=200, ge=1, le=1000),
    session: AsyncSession = Depends(get_session),
    _: uuid.UUID = Depends(get_current_user_id),
) -> list[ExchangeRateRead]:
    return await crud.list_rates(
        session,
        base_currency=base_currency,
        quote_currency=quote_currency,
        desde=desde,
        hasta=hasta,
        limit=limit,
    )


@router.get("/latest", response_model=ExchangeRateRead)
async def latest_rate(
    base_currency: str,
    quote_currency: str,
    as_of: date | None = None,
    source: str | None = None,
    session: AsyncSession = Depends(get_session),
    _: uuid.UUID = Depends(get_current_user_id),
) -> ExchangeRateRead:
    """La ultima cotizacion conocida del par (no necesariamente la de hoy: la
    serie tiene huecos y quien la muestre debe exhibir `rate_date`)."""
    rate = await crud.latest_rate(
        session, base_currency, quote_currency, as_of=as_of, source=source
    )
    if rate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return rate


@router.get("/{rate_id}", response_model=ExchangeRateRead)
async def get_rate(
    rate_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
    _: uuid.UUID = Depends(get_current_user_id),
) -> ExchangeRateRead:
    rate = await crud.get_rate(session, rate_id)
    if rate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=_NOT_FOUND)
    return rate


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
