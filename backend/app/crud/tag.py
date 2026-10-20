"""Etiquetas y su asociacion a movimientos (ver ESPECIFICACION 3.5.1).

La etiqueta es una dimension aparte de la categoria: la categoria dice de que
TIPO es el gasto, la etiqueta a que PROYECTO pertenece. Un movimiento puede
tener varias o ninguna.

Personales o de un grupo (1.7.0). La de un grupo guarda quien la creo
(`owner_id`) y su `group_id`; la usa y la administra cualquier miembro, como las
categorias del grupo. Un gasto compartido lleva etiquetas de su grupo; uno
privado, personales: la etiqueta personal de un gasto del grupo no la tendrian
los demas.
"""

import uuid

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud._borrado import vivo
from app.crud.group import membresia
from app.models.tag import Tag, TransactionTag
from app.models.transaction import Transaction
from app.models.user import GroupMember
from app.schemas.tag import TagCreate, TagUpdate, TransactionTagCreate


async def get_tag(
    session: AsyncSession, user_id: uuid.UUID, tag_id: uuid.UUID, *, incluso_borrado: bool = False
) -> Tag | None:
    """La etiqueta, si es mia (personal) o de un grupo del que soy miembro."""
    mis_grupos = select(GroupMember.group_id).where(
        GroupMember.user_id == user_id, GroupMember.deleted_at.is_(None)
    )
    stmt = select(Tag).where(
        Tag.id == tag_id,
        vivo(Tag, incluso_borrado),
        or_(
            and_(Tag.group_id.is_(None), Tag.owner_id == user_id),
            Tag.group_id.in_(mis_grupos),
        ),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def _repetida(
    session: AsyncSession,
    owner_id: uuid.UUID,
    group_id: uuid.UUID | None,
    nombre: str,
    excepto: uuid.UUID | None = None,
) -> bool:
    """Otra etiqueta viva con ese nombre en el mismo ambito (las mias, o las del
    grupo), sin distinguir mayusculas."""
    ambito = (
        Tag.group_id == group_id
        if group_id is not None
        else and_(Tag.group_id.is_(None), Tag.owner_id == owner_id)
    )
    stmt = select(Tag.id).where(
        ambito, Tag.deleted_at.is_(None), func.lower(Tag.name) == nombre.lower()
    )
    if excepto is not None:
        stmt = stmt.where(Tag.id != excepto)
    return (await session.execute(stmt)).first() is not None


async def create_tag(session: AsyncSession, owner_id: uuid.UUID, data: TagCreate) -> Tag:
    if data.group_id is not None and await membresia(session, data.group_id, owner_id) is None:
        raise DomainError("El grupo no existe")
    # Dos etiquetas con el mismo nombre no aportan nada y confunden el informe
    # por etiqueta: se rechaza (comparando sin distinguir mayusculas).
    if await _repetida(session, owner_id, data.group_id, data.name):
        raise DomainError("Ya existe una etiqueta con ese nombre")

    tag = Tag(owner_id=owner_id, **data.model_dump())
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


async def update_tag(session: AsyncSession, owner_id: uuid.UUID, tag: Tag, data: TagUpdate) -> Tag:
    campos = data.model_dump(exclude_unset=True)
    nuevo = campos.get("name")
    if (
        nuevo is not None
        and nuevo.lower() != tag.name.lower()
        and await _repetida(session, tag.owner_id, tag.group_id, nuevo, excepto=tag.id)
    ):
        raise DomainError("Ya existe una etiqueta con ese nombre")

    for campo, valor in campos.items():
        setattr(tag, campo, valor)
    await session.commit()
    await session.refresh(tag)
    return tag


async def soft_delete_tag(session: AsyncSession, tag: Tag) -> None:
    tag.deleted_at = func.now()
    await session.commit()


async def _movimiento_mio(
    session: AsyncSession, owner_id: uuid.UUID, tx_id: uuid.UUID
) -> Transaction | None:
    stmt = select(Transaction).where(
        Transaction.id == tx_id,
        Transaction.owner_id == owner_id,
        Transaction.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def get_transaction_tag(
    session: AsyncSession, owner_id: uuid.UUID, tt_id: uuid.UUID, *, incluso_borrado: bool = False
) -> TransactionTag | None:
    """Solo devuelve la asociacion si el movimiento es del usuario."""
    stmt = (
        select(TransactionTag)
        .join(Transaction, Transaction.id == TransactionTag.transaction_id)
        .where(
            TransactionTag.id == tt_id,
            vivo(TransactionTag, incluso_borrado),
            Transaction.owner_id == owner_id,
            vivo(Transaction, incluso_borrado),
        )
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def create_transaction_tag(
    session: AsyncSession, owner_id: uuid.UUID, data: TransactionTagCreate
) -> TransactionTag:
    tx = await _movimiento_mio(session, owner_id, data.transaction_id)
    if tx is None:
        raise DomainError("El movimiento no existe")
    tag = await get_tag(session, owner_id, data.tag_id)
    if tag is None:
        raise DomainError("La etiqueta no existe")
    # Del mismo espacio: un gasto del grupo, con etiquetas del grupo (1.7.0).
    if tag.group_id != tx.group_id:
        raise DomainError(
            "Un gasto del grupo lleva etiquetas del grupo; uno personal, etiquetas tuyas"
        )

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

    tt = TransactionTag(owner_id=owner_id, **data.model_dump())
    session.add(tt)
    await session.commit()
    await session.refresh(tt)
    return tt


async def soft_delete_transaction_tag(session: AsyncSession, tt: TransactionTag) -> None:
    tt.deleted_at = func.now()
    await session.commit()
