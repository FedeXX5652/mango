"""Grupos y membresía (fase 3b).

Un grupo lo crea alguien, que queda de `owner`; el owner agrega y saca miembros
por username. Los movimientos compartidos de un grupo los ve todo el grupo; lo
privado (cuenta, medio de pago) no viaja (ver ESPECIFICACION §3.10).
"""

import uuid

from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import DomainError
from app.crud import notification as notif
from app.crud.user import por_username
from app.models.user import Group, GroupMember, User
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
    """Edita nombre, color o reparto por defecto. Devuelve None si el grupo no
    existe (o esta borrado). Un reparto invalido es DomainError."""
    grupo = await session.get(Group, group_id)
    if grupo is None or grupo.deleted_at is not None:
        return None
    campos = data.model_dump(exclude_unset=True)
    if campos.get("default_split") is not None:
        campos["default_split"] = await _validar_reparto(session, group_id, campos["default_split"])
    for k, v in campos.items():
        setattr(grupo, k, v)
    await session.commit()
    await session.refresh(grupo)
    return grupo


async def _validar_reparto(
    session: AsyncSession, group_id: uuid.UUID, reparto: dict[uuid.UUID, int]
) -> dict[str, int]:
    """El reparto por defecto (0026) es de los miembros de HOY y alguien tiene
    que poner algo. Se guarda con ids en texto: son las claves de un JSON."""
    miembros = set(
        (
            await session.execute(
                select(GroupMember.user_id).where(
                    GroupMember.group_id == group_id, GroupMember.deleted_at.is_(None)
                )
            )
        ).scalars()
    )
    if not set(reparto) <= miembros:
        raise DomainError("El reparto solo puede incluir a miembros del grupo")
    if sum(reparto.values()) <= 0:
        raise DomainError("El reparto necesita al menos una parte")
    return {str(k): v for k, v in reparto.items()}


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
            title=notif.de_grupo(grupo.name if grupo else None, "Te sumaron al grupo"),
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
    # Aviso al que sacaron (1.7.0, 0019): el grupo desaparece de su app y sin el
    # aviso no sabria por que. El link va al inicio: el grupo ya no lo puede ver.
    grupo = await session.get(Group, group_id)
    nombre = grupo.name if grupo else "un grupo"
    await notif.crear(
        session,
        user_id=user_id,
        tipo="miembro_quitado",
        title=notif.de_grupo(grupo.name if grupo else None, "Te sacaron del grupo"),
        body=f"Ya no sos parte de {nombre}. Lo que cargaste ahí sigue en tus movimientos.",
        link="/",
    )
    await session.commit()
    return m


ALIAS_MAX = 40


async def set_alias(
    session: AsyncSession, group_id: uuid.UUID, user_id: uuid.UUID, alias: str | None
) -> GroupMember | None:
    """Como se llama un miembro en el grupo (0035). Cada uno edita el suyo; vacio
    vuelve a su nombre de Mango. None si no es miembro.

    No puede ser el nombre con que ya figura otro miembro del grupo: dos "Ana" en
    el balance no se distinguen."""
    m = await membresia(session, group_id, user_id)
    if m is None:
        return None
    limpio = (alias or "").strip() or None
    if limpio is not None and len(limpio) > ALIAS_MAX:
        raise DomainError(f"El nombre en el grupo puede tener hasta {ALIAS_MAX} caracteres")
    if limpio is not None:
        otros = await nombres_en_grupo(session, group_id, await _otros_miembros(session, m))
        if any(n.casefold() == limpio.casefold() for n in otros.values()):
            raise DomainError("Otro miembro del grupo ya se llama así")
    m.alias = limpio
    await session.commit()
    await session.refresh(m)
    return m


async def _otros_miembros(session: AsyncSession, m: GroupMember) -> set[uuid.UUID]:
    stmt = select(GroupMember.user_id).where(
        GroupMember.group_id == m.group_id,
        GroupMember.user_id != m.user_id,
        GroupMember.deleted_at.is_(None),
    )
    return set((await session.execute(stmt)).scalars().all())


async def nombres_por_grupo(
    session: AsyncSession, pares: set[tuple[uuid.UUID, uuid.UUID]]
) -> dict[tuple[uuid.UUID, uuid.UUID], str]:
    """(grupo, usuario) -> como se llama en ese grupo: su alias o, sin alias, su
    nombre de Mango (0035). Sirve tambien para quien ya se fue del grupo: los
    avisos de lo que hizo antes lo nombran igual."""
    if not pares:
        return {}
    stmt = (
        select(GroupMember.group_id, User.id, func.coalesce(GroupMember.alias, User.display_name))
        .select_from(User)
        .join(GroupMember, GroupMember.user_id == User.id)
        .where(
            tuple_(GroupMember.group_id, GroupMember.user_id).in_(list(pares)),
        )
    )
    nombres = {(g, u): n for g, u, n in (await session.execute(stmt)).all()}
    # Quien nunca fue miembro (no deberia pasar): su nombre de Mango.
    faltan = {u for g, u in pares if (g, u) not in nombres}
    if faltan:
        sueltos = dict(
            (await session.execute(select(User.id, User.display_name).where(User.id.in_(faltan))))
            .tuples()
            .all()
        )
        for g, u in pares:
            if (g, u) not in nombres and u in sueltos:
                nombres[(g, u)] = sueltos[u]
    return nombres


async def nombres_en_grupo(
    session: AsyncSession, group_id: uuid.UUID, user_ids: set[uuid.UUID]
) -> dict[uuid.UUID, str]:
    """usuario -> como se llama en el grupo (ver `nombres_por_grupo`)."""
    pares = await nombres_por_grupo(session, {(group_id, u) for u in user_ids})
    return {u: n for (_, u), n in pares.items()}


async def nombre_en_grupo(
    session: AsyncSession, group_id: uuid.UUID | None, user_id: uuid.UUID
) -> str | None:
    """Como se llama alguien en un grupo; sin grupo, su nombre de Mango."""
    if group_id is None:
        user = await session.get(User, user_id)
        return user.display_name if user else None
    return (await nombres_en_grupo(session, group_id, {user_id})).get(user_id)
