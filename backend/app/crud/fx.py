"""Operaciones sobre cotizaciones (ver decisiones 0005 y 0031).

Una cotizacion **no es de nadie**: es un dato de mercado, no del usuario, y la
serie es compartida. Por eso las automaticas (`source='auto'`) son del servidor:
el cliente no las crea, ni las corrige ni las borra (cambiarlas le cambiaria el
dato a todos). Para otro valor en una fecha se carga una a mano, que gana en su
fecha.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud._borrado import vivo
from app.models.fx import ExchangeRate
from app.schemas.fx import ExchangeRateCreate, ExchangeRateUpdate
from app.services.fx import FUENTE_AUTO

_DEL_SERVIDOR = "Las cotizaciones automaticas las trae el servidor: carga una a mano"


async def get_rate(
    session: AsyncSession, rate_id: uuid.UUID, *, incluso_borrado: bool = False
) -> ExchangeRate | None:
    stmt = select(ExchangeRate).where(
        ExchangeRate.id == rate_id,
        vivo(ExchangeRate, incluso_borrado),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_rate(session: AsyncSession, data: ExchangeRateCreate) -> ExchangeRate:
    if data.base_currency == data.quote_currency:
        raise DomainError("Una moneda no se cotiza contra si misma")
    if data.source == FUENTE_AUTO:
        raise DomainError(_DEL_SERVIDOR)

    dup = (
        await session.execute(
            select(ExchangeRate.id).where(
                ExchangeRate.base_currency == data.base_currency,
                ExchangeRate.quote_currency == data.quote_currency,
                ExchangeRate.rate_date == data.rate_date,
                ExchangeRate.source == data.source,
                ExchangeRate.casa.is_(None)
                if data.casa is None
                else ExchangeRate.casa == data.casa,
                ExchangeRate.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError("Ya hay una cotizacion de ese par para esa fecha y fuente")

    rate = ExchangeRate(**data.model_dump())
    session.add(rate)
    await session.commit()
    await session.refresh(rate)
    return rate


def asegurar_manual(rate: ExchangeRate) -> None:
    """Una automatica no se toca desde el cliente: es la misma para todos."""
    if rate.source == FUENTE_AUTO:
        raise DomainError(_DEL_SERVIDOR)


async def update_rate(
    session: AsyncSession, rate: ExchangeRate, data: ExchangeRateUpdate
) -> ExchangeRate:
    asegurar_manual(rate)
    if data.source == FUENTE_AUTO:
        raise DomainError(_DEL_SERVIDOR)
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(rate, campo, valor)
    await session.commit()
    await session.refresh(rate)
    return rate


async def soft_delete_rate(session: AsyncSession, rate: ExchangeRate) -> None:
    asegurar_manual(rate)
    rate.deleted_at = func.now()
    await session.commit()
