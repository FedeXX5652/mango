"""Operaciones de base para cuentas. Funciones puras: reciben la sesion,
sin logica de HTTP. Toda consulta filtra deleted_at IS NULL (borrado logico).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.account import Account
from app.schemas.account import AccountCreate, AccountUpdate


async def create_account(
    session: AsyncSession, owner_id: uuid.UUID, data: AccountCreate
) -> Account:
    account = Account(owner_id=owner_id, **data.model_dump())
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def get_account(
    session: AsyncSession, owner_id: uuid.UUID, account_id: uuid.UUID
) -> Account | None:
    stmt = select(Account).where(
        Account.id == account_id,
        Account.owner_id == owner_id,
        Account.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_accounts(
    session: AsyncSession, owner_id: uuid.UUID, *, include_archived: bool = False
) -> list[Account]:
    stmt = select(Account).where(
        Account.owner_id == owner_id,
        Account.deleted_at.is_(None),
    )
    if not include_archived:
        stmt = stmt.where(Account.archived.is_(False))
    stmt = stmt.order_by(Account.sort_order, Account.created_at)
    return list((await session.execute(stmt)).scalars().all())


async def update_account(session: AsyncSession, account: Account, data: AccountUpdate) -> Account:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await session.commit()
    await session.refresh(account)
    return account


async def soft_delete_account(session: AsyncSession, account: Account) -> None:
    account.deleted_at = func.now()
    await session.commit()
