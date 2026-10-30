"""Operaciones de base para cuentas. Funciones puras: reciben la sesion,
sin logica de HTTP. Toda consulta filtra deleted_at IS NULL (borrado logico).

Las reglas de la tarjeta (0034) se validan aca, no solo en los CHECK de la base:
un error de la base llega al cliente como 409, que el conector toma por "ya
aplicado", y la escritura se perderia sin aviso.
"""

import uuid

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud import reminder as recordatorios
from app.crud._borrado import vivo
from app.crud.group import membresia
from app.models.account import Account
from app.schemas.account import AccountCreate, AccountUpdate

# Lo que una tarjeta tiene y otra cuenta no. El saldo en otra moneda los hereda.
DATOS_TARJETA = ("brand", "last4", "closing_day", "due_day", "credit_limit")


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
    await _validar_tarjeta(session, account)
    session.add(account)
    await session.commit()
    await session.refresh(account)
    return account


async def get_account(
    session: AsyncSession,
    owner_id: uuid.UUID,
    account_id: uuid.UUID,
    *,
    incluso_borrado: bool = False,
) -> Account | None:
    """La cuenta si el usuario la puede tocar: personal suya, o conjunta de un
    grupo del que es miembro (ver 0016)."""
    account = (
        await session.execute(
            select(Account).where(Account.id == account_id, vivo(Account, incluso_borrado))
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
    values = data.model_dump(exclude_unset=True)
    # Deja de ser tarjeta: sus datos de tarjeta no tienen donde ir. Se sacan en
    # vez de rechazar, que es lo que manda un cliente 1.10 sin saber de ellos.
    if values.get("type", "credit_card") != "credit_card":
        for campo in DATOS_TARJETA:
            values.setdefault(campo, None)
    vencia = account.due_day
    for field, value in values.items():
        setattr(account, field, value)
    await _validar_tarjeta(session, account)

    # El saldo en otra moneda es la misma tarjeta: se archiva con ella.
    if "archived" in values and account.parent_account_id is None:
        await session.execute(
            update(Account)
            .where(Account.parent_account_id == account.id, Account.deleted_at.is_(None))
            .values(archived=account.archived, updated_at=func.now())
        )
    # "Avisarme" sigue a la tarjeta (0034): archivada, ya no tarjeta o sin dia de
    # vencimiento, sus recordatorios se borran; con otro dia, se corren.
    sin_vencimiento = vencia is not None and account.due_day is None
    if values.get("archived") or account.type != "credit_card" or sin_vencimiento:
        await recordatorios.borrar_vinculados(session, account_id=account.id)
    elif account.due_day != vencia:
        await recordatorios.seguir_cuenta_tarjeta(session, account)
    await session.commit()
    await session.refresh(account)
    return account


async def soft_delete_account(session: AsyncSession, account: Account) -> None:
    account.deleted_at = func.now()
    # La tarjeta se va con su saldo en otra moneda y con su "Avisarme".
    await session.execute(
        update(Account)
        .where(Account.parent_account_id == account.id, Account.deleted_at.is_(None))
        .values(deleted_at=func.now(), updated_at=func.now())
    )
    await recordatorios.borrar_vinculados(session, account_id=account.id)
    await session.commit()


async def _saldo_en(
    session: AsyncSession, padre_id: uuid.UUID, moneda: str, salvo: uuid.UUID | None = None
) -> uuid.UUID | None:
    """El saldo vivo de la tarjeta en esa moneda, si hay (salvo esa cuenta)."""
    stmt = select(Account.id).where(
        Account.parent_account_id == padre_id,
        Account.currency == moneda,
        Account.deleted_at.is_(None),
    )
    if salvo is not None:
        stmt = stmt.where(Account.id != salvo)
    return await session.scalar(stmt.limit(1))


async def _tiene_saldos(session: AsyncSession, account_id: uuid.UUID) -> bool:
    return (
        await session.scalar(
            select(Account.id)
            .where(Account.parent_account_id == account_id, Account.deleted_at.is_(None))
            .limit(1)
        )
    ) is not None


async def _validar_tarjeta(session: AsyncSession, account: Account) -> None:
    """La tarjeta de credito y su saldo en otra moneda (0034). Sin autoflush: las
    consultas mandarian antes el cambio, y un CHECK fallaria como error de la base
    (409) en vez de este 422."""
    with session.no_autoflush:
        await _reglas_de_tarjeta(session, account)


async def _reglas_de_tarjeta(session: AsyncSession, account: Account) -> None:
    con_datos = any(getattr(account, campo) is not None for campo in DATOS_TARJETA)
    if account.type != "credit_card":
        if account.parent_account_id is not None:
            raise DomainError("El saldo en otra moneda de una tarjeta es de tipo tarjeta")
        if con_datos:
            raise DomainError("Cierre, vencimiento, marca y límite son de una tarjeta de crédito")
        if account.id is not None and await _tiene_saldos(session, account.id):
            raise DomainError("Tiene un saldo en otra moneda: eliminalo antes de cambiarle el tipo")
        return

    if account.parent_account_id is None:
        # La principal: sus otros saldos no pueden quedar en su misma moneda.
        if account.id is not None and await _saldo_en(session, account.id, account.currency):
            raise DomainError(f"La tarjeta ya tiene un saldo en {account.currency}")
        return

    if con_datos:
        raise DomainError("El saldo en otra moneda usa los datos de su tarjeta")
    if account.parent_account_id == account.id:
        raise DomainError("La tarjeta no existe")
    padre = await session.get(Account, account.parent_account_id)
    if (
        padre is None
        or padre.deleted_at is not None
        or padre.type != "credit_card"
        or padre.parent_account_id is not None
        or padre.owner_id != account.owner_id
        or padre.group_id != account.group_id
    ):
        raise DomainError("La tarjeta no existe")
    if padre.currency == account.currency:
        raise DomainError("El saldo en otra moneda tiene que ser de otra moneda que la tarjeta")
    if account.id is not None and await _tiene_saldos(session, account.id):
        raise DomainError("Esta tarjeta tiene sus propios saldos: no puede ser saldo de otra")
    if await _saldo_en(session, padre.id, account.currency, salvo=account.id):
        raise DomainError(f"La tarjeta ya tiene un saldo en {account.currency}")
