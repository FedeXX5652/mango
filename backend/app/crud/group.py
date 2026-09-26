"""Grupos y membresía (fase 3b).

Un grupo lo crea alguien, que queda de `owner`; el owner agrega y saca miembros
por username. Los movimientos compartidos de un grupo los ve todo el grupo; lo
privado (cuenta, medio de pago) no viaja (ver ESPECIFICACION §3.10).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud import notification as notif
from app.crud.user import por_username
from app.models.user import Group, GroupMember
from app.schemas.group import GroupCreate, GroupUpdate


async def create_group(session: AsyncSession, creador_id: uuid.UUID, data: GroupCreate) -> Group:
    grupo = Group(
        id=data.id,
        name=data.name,
        base_currency=data.base_currency,
        color=data.color,
        created_by=creador_id,
    )
    session.add(grupo)
    # Quien lo crea es el primer miembro, con rol owner.
    session.add(GroupMember(id=uuid.uuid4(), group_id=grupo.id, user_id=creador_id, role="owner"))
    # El grupo tiene que existir en la base antes de colgarle categorias: la FK
    # categories.group_id lo exige y el orden de inserts no esta garantizado.
    await session.flush()
    # Arbol de categorias por defecto, pero DEL GRUPO (group_id, owner_id NULL):
    # asi el primer gasto compartido ya tiene con que categorizarse (ver 0014).
    _sembrar_categorias_de_grupo(session, grupo.id)
    await session.commit()
    await session.refresh(grupo)
    return grupo


def _sembrar_categorias_de_grupo(session: AsyncSession, group_id: uuid.UUID) -> None:
    # Import local para no crear un ciclo (seed importa cosas de app).
    from app.models.category import Category
    from app.seed import DEFAULT_CATEGORIES

    for orden, (nombre, kind, hijas) in enumerate(DEFAULT_CATEGORIES):
        padre = Category(
            id=uuid.uuid4(), group_id=group_id, name=nombre, kind=kind, sort_order=orden
        )
        session.add(padre)
        for orden_hija, nombre_hija in enumerate(hijas):
            session.add(
                Category(
                    id=uuid.uuid4(),
                    group_id=group_id,
                    parent_id=padre.id,
                    name=nombre_hija,
                    kind=kind,
                    sort_order=orden_hija,
                )
            )


async def update_group(
    session: AsyncSession, group_id: uuid.UUID, data: GroupUpdate
) -> Group | None:
    """Edita nombre/color. Devuelve None si el grupo no existe (o esta borrado)."""
    grupo = await session.get(Group, group_id)
    if grupo is None or grupo.deleted_at is not None:
        return None
    campos = data.model_dump(exclude_unset=True)
    for k, v in campos.items():
        setattr(grupo, k, v)
    await session.commit()
    await session.refresh(grupo)
    return grupo


async def membresia(
    session: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID
) -> GroupMember | None:
    """La membresía vigente de un usuario en un grupo, o None."""
    stmt = select(GroupMember).where(
        GroupMember.group_id == group_id,
        GroupMember.user_id == user_id,
        GroupMember.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def es_owner(session: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    m = await membresia(session, group_id, user_id)
    return m is not None and m.role == "owner"


async def add_member(session: AsyncSession, group_id: uuid.UUID, username: str) -> GroupMember:
    """Agrega por username. Reactiva la membresía si la persona había salido, en
    vez de crear otra (el único es por (grupo, usuario))."""
    user = await por_username(session, username)
    if user is None:
        raise DomainError("No existe un usuario con ese nombre")

    async def _avisar() -> None:
        # Aviso al recien sumado: te sumaron al grupo (0019).
        grupo = await session.get(Group, group_id)
        await notif.crear(
            session,
            user_id=user.id,
            tipo="miembro_agregado",
            title="Te sumaron a un grupo",
            body=f"Ahora sos parte de {grupo.name if grupo else 'un grupo'}.",
            link=f"/grupos/{group_id}",
        )

    # ¿Ya estuvo? Reactivar en vez de duplicar.
    stmt = select(GroupMember).where(
        GroupMember.group_id == group_id, GroupMember.user_id == user.id
    )
    existente = (await session.execute(stmt)).scalar_one_or_none()
    if existente is not None:
        if existente.deleted_at is None:
            raise DomainError("Ya es miembro del grupo")
        existente.deleted_at = None
        existente.role = "member"
        await _avisar()
        await session.commit()
        await session.refresh(existente)
        return existente

    miembro = GroupMember(id=uuid.uuid4(), group_id=group_id, user_id=user.id, role="member")
    session.add(miembro)
    await _avisar()
    await session.commit()
    await session.refresh(miembro)
    return miembro


async def remove_member(
    session: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID
) -> GroupMember | None:
    """Saca a un miembro (borrado lógico). El owner no se puede sacar a sí mismo:
    un grupo sin owner queda sin quién lo administre."""
    m = await membresia(session, group_id, user_id)
    if m is None:
        return None
    if m.role == "owner":
        raise DomainError("El dueño del grupo no se puede quitar")
    m.deleted_at = func.now()
    await session.commit()
    return m
