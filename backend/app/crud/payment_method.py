"""Medios de pago y su asociacion (medio, moneda) -> cuenta.

Esa asociacion es la que permite deducir de que cuenta salio una compra
importada (ver especificacion 3.3 y 4.3). La unicidad (medio, moneda) la
garantiza la base; aca se valida antes para dar un error claro.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.account import Account, PaymentMethod, PaymentMethodAccount
from app.schemas.payment_method import (
    PaymentMethodAccountCreate,
    PaymentMethodCreate,
    PaymentMethodUpdate,
)


async def _account_owned(session: AsyncSession, owner_id: uuid.UUID, account_id: uuid.UUID) -> bool:
    stmt = select(Account.id).where(
        Account.id == account_id,
        Account.owner_id == owner_id,
        Account.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


# --- Medios de pago ---------------------------------------------------------


async def create_payment_method(
    session: AsyncSession, owner_id: uuid.UUID, data: PaymentMethodCreate
) -> PaymentMethod:
    if data.default_account_id is not None and not await _account_owned(
        session, owner_id, data.default_account_id
    ):
        raise DomainError("La cuenta por defecto no existe")
    pm = PaymentMethod(owner_id=owner_id, **data.model_dump())
    session.add(pm)
    await session.commit()
    await session.refresh(pm)
    return pm


async def get_payment_method(
    session: AsyncSession, owner_id: uuid.UUID, pm_id: uuid.UUID
) -> PaymentMethod | None:
    stmt = select(PaymentMethod).where(
        PaymentMethod.id == pm_id,
        PaymentMethod.owner_id == owner_id,
        PaymentMethod.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_payment_methods(
    session: AsyncSession, owner_id: uuid.UUID, *, include_archived: bool = False
) -> list[PaymentMethod]:
    stmt = select(PaymentMethod).where(
        PaymentMethod.owner_id == owner_id,
        PaymentMethod.deleted_at.is_(None),
    )
    if not include_archived:
        stmt = stmt.where(PaymentMethod.archived.is_(False))
    stmt = stmt.order_by(PaymentMethod.sort_order, PaymentMethod.created_at)
    return list((await session.execute(stmt)).scalars().all())


async def update_payment_method(
    session: AsyncSession, owner_id: uuid.UUID, pm: PaymentMethod, data: PaymentMethodUpdate
) -> PaymentMethod:
    values = data.model_dump(exclude_unset=True)
    if values.get("default_account_id") is not None and not await _account_owned(
        session, owner_id, values["default_account_id"]
    ):
        raise DomainError("La cuenta por defecto no existe")
    for field, value in values.items():
        setattr(pm, field, value)
    await session.commit()
    await session.refresh(pm)
    return pm


async def soft_delete_payment_method(session: AsyncSession, pm: PaymentMethod) -> None:
    pm.deleted_at = func.now()
    await session.commit()


# --- Asociacion (medio, moneda) -> cuenta -----------------------------------


async def create_pma(
    session: AsyncSession,
    owner_id: uuid.UUID,
    pm: PaymentMethod,
    data: PaymentMethodAccountCreate,
) -> PaymentMethodAccount:
    if not await _account_owned(session, owner_id, data.account_id):
        raise DomainError("La cuenta no existe")

    dup = (
        await session.execute(
            select(PaymentMethodAccount.id).where(
                PaymentMethodAccount.payment_method_id == pm.id,
                PaymentMethodAccount.currency == data.currency,
                PaymentMethodAccount.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError(f"Ya hay una cuenta asociada para {data.currency}")

    pma = PaymentMethodAccount(payment_method_id=pm.id, **data.model_dump())
    session.add(pma)
    await session.commit()
    await session.refresh(pma)
    return pma


async def list_pma(session: AsyncSession, pm_id: uuid.UUID) -> list[PaymentMethodAccount]:
    stmt = (
        select(PaymentMethodAccount)
        .where(
            PaymentMethodAccount.payment_method_id == pm_id,
            PaymentMethodAccount.deleted_at.is_(None),
        )
        .order_by(PaymentMethodAccount.currency)
    )
    return list((await session.execute(stmt)).scalars().all())


async def get_pma(
    session: AsyncSession, pm_id: uuid.UUID, pma_id: uuid.UUID
) -> PaymentMethodAccount | None:
    stmt = select(PaymentMethodAccount).where(
        PaymentMethodAccount.id == pma_id,
        PaymentMethodAccount.payment_method_id == pm_id,
        PaymentMethodAccount.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def soft_delete_pma(session: AsyncSession, pma: PaymentMethodAccount) -> None:
    pma.deleted_at = func.now()
    await session.commit()
