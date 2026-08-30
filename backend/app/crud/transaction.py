"""Transacciones: gasto, ingreso y transferencia sobre un solo modelo.

Toda la validacion de dominio (existencia, propiedad, coherencia por `kind`)
vive en `_validate_invariants`, que comparten alta y edicion. La base impone
las mismas reglas por CHECK; aca se validan antes para dar errores claros y para
lo que la base no puede (propiedad del recurso, kind de la categoria).

Fase 1: carga manual, siempre `status='confirmed'` y `source='manual'`. El
estado 'pending' solo lo produce la ingesta automatica (regla no negociable 4).
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.account import Account, PaymentMethod
from app.models.category import Category
from app.models.transaction import Transaction
from app.schemas.transaction import TransactionCreate, TransactionUpdate


async def _account_owned(session: AsyncSession, owner_id: uuid.UUID, account_id: uuid.UUID) -> bool:
    stmt = select(Account.id).where(
        Account.id == account_id,
        Account.owner_id == owner_id,
        Account.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


async def _pm_owned(session: AsyncSession, owner_id: uuid.UUID, pm_id: uuid.UUID) -> bool:
    stmt = select(PaymentMethod.id).where(
        PaymentMethod.id == pm_id,
        PaymentMethod.owner_id == owner_id,
        PaymentMethod.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


async def _category_kind(
    session: AsyncSession, owner_id: uuid.UUID, category_id: uuid.UUID
) -> str | None:
    stmt = select(Category.kind).where(
        Category.id == category_id,
        Category.owner_id == owner_id,
        Category.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _validate_invariants(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    kind: str,
    account_id: uuid.UUID | None,
    transfer_account_id: uuid.UUID | None,
    category_id: uuid.UUID | None,
    payment_method_id: uuid.UUID | None,
) -> None:
    # Una transaccion confirmada siempre tiene cuenta (tx_confirmed_chk).
    if account_id is None:
        raise DomainError("La cuenta es obligatoria")
    if not await _account_owned(session, owner_id, account_id):
        raise DomainError("La cuenta no existe")

    if payment_method_id is not None and not await _pm_owned(session, owner_id, payment_method_id):
        raise DomainError("El medio de pago no existe")

    if kind == "transfer":
        if category_id is not None:
            raise DomainError("Una transferencia no lleva categoria")
        if transfer_account_id is None:
            raise DomainError("Una transferencia necesita la cuenta de destino")
        if transfer_account_id == account_id:
            raise DomainError("Las dos cuentas de la transferencia deben ser distintas")
        if not await _account_owned(session, owner_id, transfer_account_id):
            raise DomainError("La cuenta de destino no existe")
    else:  # expense / income
        if transfer_account_id is not None:
            raise DomainError("Solo una transferencia lleva cuenta de destino")
        if category_id is None:
            raise DomainError("La categoria es obligatoria en gasto e ingreso")
        cat_kind = await _category_kind(session, owner_id, category_id)
        if cat_kind is None:
            raise DomainError("La categoria no existe")
        if cat_kind != kind:
            raise DomainError(f"La categoria debe ser de tipo {kind}")


async def create_transaction(
    session: AsyncSession,
    owner_id: uuid.UUID,
    data: TransactionCreate,
    *,
    source: str = "manual",
) -> Transaction:
    # `source` distingue el origen: 'manual' (API), 'template' (aplicar
    # plantilla) o 'recurring' (regla recurrente). Nunca produce 'pending'
    # (eso es exclusivo de la ingesta automatica, regla 4).
    await _validate_invariants(
        session,
        owner_id,
        kind=data.kind,
        account_id=data.account_id,
        transfer_account_id=data.transfer_account_id,
        category_id=data.category_id,
        payment_method_id=data.payment_method_id,
    )
    tx = Transaction(
        owner_id=owner_id,
        status="confirmed",
        source=source,
        **data.model_dump(),
    )
    session.add(tx)
    await session.commit()
    await session.refresh(tx)
    return tx


async def get_transaction(
    session: AsyncSession, owner_id: uuid.UUID, tx_id: uuid.UUID
) -> Transaction | None:
    stmt = select(Transaction).where(
        Transaction.id == tx_id,
        Transaction.owner_id == owner_id,
        Transaction.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def list_transactions(
    session: AsyncSession,
    owner_id: uuid.UUID,
    *,
    account_id: uuid.UUID | None = None,
    category_id: uuid.UUID | None = None,
    kind: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[Transaction]:
    stmt = select(Transaction).where(
        Transaction.owner_id == owner_id,
        Transaction.deleted_at.is_(None),
    )
    if account_id is not None:
        # Incluye transferencias donde la cuenta es origen o destino.
        stmt = stmt.where(
            (Transaction.account_id == account_id) | (Transaction.transfer_account_id == account_id)
        )
    if category_id is not None:
        stmt = stmt.where(Transaction.category_id == category_id)
    if kind is not None:
        stmt = stmt.where(Transaction.kind == kind)
    if date_from is not None:
        stmt = stmt.where(Transaction.occurred_at >= date_from)
    if date_to is not None:
        stmt = stmt.where(Transaction.occurred_at < date_to)
    stmt = stmt.order_by(Transaction.occurred_at.desc()).limit(limit).offset(offset)
    return list((await session.execute(stmt)).scalars().all())


async def update_transaction(
    session: AsyncSession, owner_id: uuid.UUID, tx: Transaction, data: TransactionUpdate
) -> Transaction:
    values = data.model_dump(exclude_unset=True)

    # Valido sobre el resultado de aplicar los cambios (valor nuevo o el actual).
    def eff(field: str):
        return values.get(field, getattr(tx, field))

    await _validate_invariants(
        session,
        owner_id,
        kind=eff("kind"),
        account_id=eff("account_id"),
        transfer_account_id=eff("transfer_account_id"),
        category_id=eff("category_id"),
        payment_method_id=eff("payment_method_id"),
    )

    for field, value in values.items():
        setattr(tx, field, value)
    await session.commit()
    await session.refresh(tx)
    return tx


async def soft_delete_transaction(session: AsyncSession, tx: Transaction) -> None:
    tx.deleted_at = func.now()
    await session.commit()
