"""Operaciones de base para cuentas. Funciones puras: reciben la sesion,
sin logica de HTTP. Toda consulta filtra deleted_at IS NULL (borrado logico).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud.group import membresia
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountUpdate


async def create_account(
    session: AsyncSession, owner_id: uuid.UUID, data: AccountCreate
) -> Account:
    # Ambito: conjunta (del grupo, miembro) o personal (ver 0016).
    if data.group_id is not None:
        if await membresia(session, data.group_id, owner_id) is None:
            raise DomainError("El grupo no existe")
        dueno: uuid.UUID | None = None
        grupo: uuid.UUID | None = data.group_id
    else:
        dueno = owner_id
        grupo = None
    campos = data.model_dump(exclude={"group_id"})
    account = Account(owner_id=dueno, group_id=grupo, **campos)
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def get_account(
    session: AsyncSession, owner_id: uuid.UUID, account_id: uuid.UUID
) -> Account | None:
    """La cuenta si el usuario la puede tocar: personal suya, o conjunta de un
    grupo del que es miembro (ver 0016)."""
    account = (
        await session.execute(
            select(Account).where(Account.id == account_id, Account.deleted_at.is_(None))
        )
    ).scalar_one_or_none()
    if account is None:
        return None
    if account.owner_id == owner_id:
        return account
    if account.group_id is not None and await membresia(session, account.group_id, owner_id):
        return account
    return None


async def update_account(session: AsyncSession, account: Account, data: AccountUpdate) -> Account:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    await session.commit()
    await session.refresh(account)
    return account


async def soft_delete_account(session: AsyncSession, account: Account) -> None:
    account.deleted_at = func.now()
    await session.commit()
