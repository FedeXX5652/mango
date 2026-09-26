"""Partes de un gasto compartido (fase 3b.3, ver 0015).

Un split dice cuanto de un gasto le toca a cada miembro (reparto tipo Splitwise).
Los crea el **dueño del gasto** (quien lo cargo), sobre un gasto **compartido**.
La invariante "las partes suman el total" la garantiza el cliente antes de subir
(no puede ser un CHECK: las filas llegan de a una por la cola de sync); aca se
valida lo que si se puede por fila: que el gasto sea compartido y propio, que la
persona sea miembro del grupo, y que la parte no sea negativa.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud.group import membresia
from app.models.transaction import Transaction, TransactionSplit
from app.schemas.split import SplitCreate, SplitUpdate


async def _tx_compartida_propia(
    session: AsyncSession, owner_id: uuid.UUID, tx_id: uuid.UUID
) -> Transaction | None:
    stmt = select(Transaction).where(
        Transaction.id == tx_id,
        Transaction.owner_id == owner_id,
        Transaction.visibility == "shared",
        Transaction.group_id.isnot(None),
        Transaction.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_split(
    session: AsyncSession, owner_id: uuid.UUID, split_id: uuid.UUID
) -> TransactionSplit | None:
    """El split si cuelga de un gasto del usuario. La propiedad se hereda del
    gasto: no hay owner_id propio en la tabla."""
    stmt = (
        select(TransactionSplit)
        .join(Transaction, Transaction.id == TransactionSplit.transaction_id)
        .where(
            TransactionSplit.id == split_id,
            TransactionSplit.deleted_at.is_(None),
            Transaction.owner_id == owner_id,
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_split(
    session: AsyncSession, owner_id: uuid.UUID, data: SplitCreate
) -> TransactionSplit:
    tx = await _tx_compartida_propia(session, owner_id, data.transaction_id)
    if tx is None:
        raise DomainError("El movimiento compartido no existe")
    if await membresia(session, tx.group_id, data.user_id) is None:
        raise DomainError("La parte es de alguien que no es miembro del grupo")

    split = TransactionSplit(**data.model_dump())
    session.add(split)
    await session.commit()
    await session.refresh(split)
    return split


async def update_split(
    session: AsyncSession, split: TransactionSplit, data: SplitUpdate
) -> TransactionSplit:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(split, field, value)
    await session.commit()
    await session.refresh(split)
    return split


async def soft_delete_split(session: AsyncSession, split: TransactionSplit) -> None:
    split.deleted_at = func.now()
    await session.commit()
