"""Etiquetas y su asociacion a movimientos (ver ESPECIFICACION 3.5.1).

La etiqueta es una dimension aparte de la categoria: la categoria dice de que
TIPO es el gasto, la etiqueta a que PROYECTO pertenece. Un movimiento puede
tener varias o ninguna.
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.models.tag import Tag, TransactionTag
from app.models.transaction import Transaction
from app.schemas.tag import TagCreate, TagUpdate, TransactionTagCreate


async def get_tag(session: AsyncSession, owner_id: uuid.UUID, tag_id: uuid.UUID) -> Tag | None:
    stmt = select(Tag).where(
        Tag.id == tag_id,
        Tag.owner_id == owner_id,
        Tag.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_tag(session: AsyncSession, owner_id: uuid.UUID, data: TagCreate) -> Tag:
    # Dos etiquetas con el mismo nombre no aportan nada y confunden el informe
    # por etiqueta: se rechaza (comparando sin distinguir mayusculas).
    dup = (
        await session.execute(
            select(Tag.id).where(
                Tag.owner_id == owner_id,
                Tag.deleted_at.is_(None),
                func.lower(Tag.name) == data.name.lower(),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError("Ya existe una etiqueta con ese nombre")

    tag = Tag(owner_id=owner_id, **data.model_dump())
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


async def list_tags(
    session: AsyncSession, owner_id: uuid.UUID, *, include_archived: bool = True
) -> list[Tag]:
    # Alfabetico: las etiquetas no tienen orden manual (decision de interfaz).
    stmt = select(Tag).where(Tag.owner_id == owner_id, Tag.deleted_at.is_(None))
    if not include_archived:
        stmt = stmt.where(Tag.archived.is_(False))
    return list((await session.execute(stmt.order_by(func.lower(Tag.name)))).scalars().all())


async def update_tag(session: AsyncSession, owner_id: uuid.UUID, tag: Tag, data: TagUpdate) -> Tag:
    campos = data.model_dump(exclude_unset=True)
    nuevo = campos.get("name")
    if nuevo is not None and nuevo.lower() != tag.name.lower():
        dup = (
            await session.execute(
                select(Tag.id).where(
                    Tag.owner_id == owner_id,
                    Tag.id != tag.id,
                    Tag.deleted_at.is_(None),
                    func.lower(Tag.name) == nuevo.lower(),
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise DomainError("Ya existe una etiqueta con ese nombre")

    for campo, valor in campos.items():
        setattr(tag, campo, valor)
    await session.commit()
    await session.refresh(tag)
    return tag


async def soft_delete_tag(session: AsyncSession, tag: Tag) -> None:
    tag.deleted_at = func.now()
    await session.commit()


async def _pertenece(session: AsyncSession, owner_id: uuid.UUID, tx_id: uuid.UUID) -> bool:
    stmt = select(Transaction.id).where(
        Transaction.id == tx_id,
        Transaction.owner_id == owner_id,
        Transaction.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


async def get_transaction_tag(
    session: AsyncSession, owner_id: uuid.UUID, tt_id: uuid.UUID
) -> TransactionTag | None:
    """Solo devuelve la asociacion si el movimiento es del usuario."""
    stmt = (
        select(TransactionTag)
        .join(Transaction, Transaction.id == TransactionTag.transaction_id)
        .where(
            TransactionTag.id == tt_id,
            TransactionTag.deleted_at.is_(None),
            Transaction.owner_id == owner_id,
            Transaction.deleted_at.is_(None),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_transaction_tag(
    session: AsyncSession, owner_id: uuid.UUID, data: TransactionTagCreate
) -> TransactionTag:
    if not await _pertenece(session, owner_id, data.transaction_id):
        raise DomainError("El movimiento no existe")
    if await get_tag(session, owner_id, data.tag_id) is None:
        raise DomainError("La etiqueta no existe")

    dup = (
        await session.execute(
            select(TransactionTag.id).where(
                TransactionTag.transaction_id == data.transaction_id,
                TransactionTag.tag_id == data.tag_id,
                TransactionTag.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise DomainError("El movimiento ya tiene esa etiqueta")

    tt = TransactionTag(**data.model_dump())
    session.add(tt)
    await session.commit()
    await session.refresh(tt)
    return tt


async def soft_delete_transaction_tag(session: AsyncSession, tt: TransactionTag) -> None:
    tt.deleted_at = func.now()
    await session.commit()
