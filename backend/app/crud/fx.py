"""Operaciones sobre cotizaciones (ver decision 0005).

Una cotizacion **no es de nadie**: es un dato de mercado, no del usuario. La
tabla no tiene `owner_id` y en fase 1 (un solo usuario) eso alcanza. Cuando
llegue el multiusuario habra que decidir si la serie es compartida (lo natural)
o por usuario.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.fx import ExchangeRate
from app.schemas.fx import ExchangeRateCreate, ExchangeRateUpdate


async def get_rate(session: AsyncSession, rate_id: uuid.UUID) -> ExchangeRate | None:
    stmt = select(ExchangeRate).where(
        ExchangeRate.id == rate_id,
        ExchangeRate.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_rate(session: AsyncSession, data: ExchangeRateCreate) -> ExchangeRate:
    if data.base_currency == data.quote_currency:
        raise DomainError("Una moneda no se cotiza contra si misma")

    dup = (
        await session.execute(
            select(ExchangeRate.id).where(
                ExchangeRate.base_currency == data.base_currency,
                ExchangeRate.quote_currency == data.quote_currency,
                ExchangeRate.rate_date == data.rate_date,
                ExchangeRate.source == data.source,
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


async def update_rate(
    session: AsyncSession, rate: ExchangeRate, data: ExchangeRateUpdate
) -> ExchangeRate:
    for campo, valor in data.model_dump(exclude_unset=True).items():
        setattr(rate, campo, valor)
    await session.commit()
    await session.refresh(rate)
    return rate


async def soft_delete_rate(session: AsyncSession, rate: ExchangeRate) -> None:
    rate.deleted_at = func.now()
    await session.commit()
