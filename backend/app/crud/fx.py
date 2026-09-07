"""Operaciones sobre cotizaciones (ver decision 0005).

Una cotizacion **no es de nadie**: es un dato de mercado, no del usuario. La
tabla no tiene `owner_id` y en fase 1 (un solo usuario) eso alcanza. Cuando
llegue el multiusuario habra que decidir si la serie es compartida (lo natural)
o por usuario.
"""

import uuid
from datetime import date

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


async def list_rates(
    session: AsyncSession,
    *,
    base_currency: str | None = None,
    quote_currency: str | None = None,
    desde: date | None = None,
    hasta: date | None = None,
    limit: int = 200,
) -> list[ExchangeRate]:
    stmt = select(ExchangeRate).where(ExchangeRate.deleted_at.is_(None))
    if base_currency:
        stmt = stmt.where(ExchangeRate.base_currency == base_currency.upper())
    if quote_currency:
        stmt = stmt.where(ExchangeRate.quote_currency == quote_currency.upper())
    if desde:
        stmt = stmt.where(ExchangeRate.rate_date >= desde)
    if hasta:
        stmt = stmt.where(ExchangeRate.rate_date <= hasta)
    stmt = stmt.order_by(ExchangeRate.rate_date.desc(), ExchangeRate.created_at.desc())
    return list((await session.execute(stmt.limit(limit))).scalars().all())


async def latest_rate(
    session: AsyncSession,
    base_currency: str,
    quote_currency: str,
    *,
    as_of: date | None = None,
    source: str | None = None,
) -> ExchangeRate | None:
    """La ultima cotizacion conocida del par, opcionalmente a una fecha.

    "Ultima conocida" y no "la del dia": la serie tiene huecos (el servidor no
    esta prendido todos los dias) y el patrimonio se muestra igual, con la fecha
    del dato a la vista (ver 0005)."""
    stmt = select(ExchangeRate).where(
        ExchangeRate.base_currency == base_currency.upper(),
        ExchangeRate.quote_currency == quote_currency.upper(),
        ExchangeRate.deleted_at.is_(None),
    )
    if as_of:
        stmt = stmt.where(ExchangeRate.rate_date <= as_of)
    if source:
        stmt = stmt.where(ExchangeRate.source == source)
    # A igual fecha, **lo cargado a mano gana**: si el usuario tipeo una
    # cotizacion es porque la oficial que trajo la API no es la que aplica
    # (en Argentina, MEP o tarjeta). Ver 0005.
    stmt = stmt.order_by(
        ExchangeRate.rate_date.desc(),
        (ExchangeRate.source == "auto").asc(),
        ExchangeRate.created_at.desc(),
    )
    return (await session.execute(stmt.limit(1))).scalar_one_or_none()


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
