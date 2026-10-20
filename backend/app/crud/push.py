"""Suscripciones de push (1.4.0). Estado del servidor: no se sincroniza."""

import uuid

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.push import PushSubscription
from app.schemas.push import PushSubscriptionCreate


async def guardar(
    session: AsyncSession, user_id: uuid.UUID, data: PushSubscriptionCreate
) -> PushSubscription | None:
    """Alta o actualizacion por endpoint: un endpoint es un dispositivo. Es una
    sola sentencia, asi que dos altas a la vez del mismo dispositivo no chocan.

    Si el endpoint es de otra persona, pasa a ser de quien lo registra solo si
    trae las mismas claves: es el mismo navegador y ahi inicio sesion otra
    persona (los avisos de la anterior no tienen que llegar ahi). Con otras
    claves no es ese navegador: devuelve None y no toca nada.

    Las familias que acepta (`tipos`) se cambian solo si vienen (1.7.0): la app
    se re-registra cada vez que abre, sin ellas, y no tiene que borrar lo que la
    persona eligio. Si el dispositivo cambia de dueño, lo elegido por el anterior
    no sigue: vuelve a lo que llega (NULL, todas, si no vino nada)."""
    alta = insert(PushSubscription).values(
        id=data.id,
        user_id=user_id,
        endpoint=data.endpoint,
        p256dh=data.keys.p256dh,
        auth=data.keys.auth,
        dispositivo=data.dispositivo,
        tipos=data.tipos,
    )
    nueva = alta.excluded
    mismo_dueno = PushSubscription.user_id == nueva.user_id
    tipos = (
        nueva.tipos
        if "tipos" in data.model_fields_set
        else case((mismo_dueno, PushSubscription.tipos), else_=nueva.tipos)
    )
    stmt = (
        alta.on_conflict_do_update(
            index_elements=[PushSubscription.endpoint],
            index_where=PushSubscription.deleted_at.is_(None),
            set_={
                "user_id": nueva.user_id,
                "p256dh": nueva.p256dh,
                "auth": nueva.auth,
                "dispositivo": nueva.dispositivo,
                "tipos": tipos,
                "updated_at": func.now(),
            },
            where=or_(
                mismo_dueno,
                and_(
                    PushSubscription.p256dh == nueva.p256dh,
                    PushSubscription.auth == nueva.auth,
                ),
            ),
        )
        .returning(PushSubscription)
        .execution_options(populate_existing=True)
    )
    sub = (await session.execute(stmt)).scalar_one_or_none()
    await session.commit()
    return sub


async def de_endpoint(
    session: AsyncSession, user_id: uuid.UUID, endpoint: str
) -> PushSubscription | None:
    """La suscripcion vigente de ese endpoint, si es del usuario."""
    return (
        await session.execute(
            select(PushSubscription).where(
                PushSubscription.endpoint == endpoint,
                PushSubscription.user_id == user_id,
                PushSubscription.deleted_at.is_(None),
            )
        )
    ).scalar_one_or_none()


async def dar_de_baja(session: AsyncSession, sub: PushSubscription) -> None:
    sub.deleted_at = func.now()
    await session.commit()


async def del_usuario(
    session: AsyncSession, user_id: uuid.UUID, tipo: str | None = None
) -> list[PushSubscription]:
    """Los dispositivos del usuario que aceptan ese tipo de aviso (sin tipo,
    todos). `tipos` NULL = acepta todos."""
    stmt = select(PushSubscription).where(
        PushSubscription.user_id == user_id,
        PushSubscription.deleted_at.is_(None),
    )
    if tipo is not None:
        stmt = stmt.where(
            or_(PushSubscription.tipos.is_(None), PushSubscription.tipos.contains([tipo]))
        )
    return list((await session.execute(stmt)).scalars().all())
