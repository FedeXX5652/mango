"""Avisos in-app (fase 3b, ver 0019).

Los crea el servidor en eventos; el cliente solo los marca leidos. `crear` no
hace commit: se llama dentro de la transaccion del evento que lo dispara, asi el
aviso y el hecho que lo genera se guardan juntos (o ninguno).
"""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Notification


def formatear_monto(centavos: int, moneda: str) -> str:
    """Monto legible para el texto del aviso. Formato es-AR simple: separador de
    miles con punto y dos decimales con coma. Las monedas sin centavos (JPY) no
    se dividen; el resto, si."""
    sin_decimales = moneda in {"JPY", "KRW", "CLP", "COP"}
    if sin_decimales:
        entero = centavos
        cuerpo = f"{entero:,.0f}".replace(",", ".")
    else:
        cuerpo = f"{centavos / 100:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    simbolo = {"ARS": "$", "USD": "US$"}.get(moneda, f"{moneda} ")
    return f"{simbolo}{cuerpo}"


async def crear(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    tipo: str,
    title: str,
    body: str,
    link: str | None = None,
) -> Notification:
    aviso = Notification(
        id=uuid.uuid4(), user_id=user_id, type=tipo, title=title, body=body, link=link
    )
    session.add(aviso)
    return aviso


async def get_notification(
    session: AsyncSession, user_id: uuid.UUID, notif_id: uuid.UUID
) -> Notification | None:
    stmt = select(Notification).where(
        Notification.id == notif_id,
        Notification.user_id == user_id,
        Notification.deleted_at.is_(None),
    )
    return (await session.execute(stmt)).scalar_one_or_none()


async def marcar_leida(session: AsyncSession, aviso: Notification) -> Notification:
    if aviso.read_at is None:
        aviso.read_at = func.now()
        await session.commit()
        await session.refresh(aviso)
    return aviso


async def marcar_todas_leidas(session: AsyncSession, user_id: uuid.UUID) -> int:
    avisos = (
        (
            await session.execute(
                select(Notification).where(
                    Notification.user_id == user_id,
                    Notification.read_at.is_(None),
                    Notification.deleted_at.is_(None),
                )
            )
        )
        .scalars()
        .all()
    )
    for a in avisos:
        a.read_at = func.now()
    await session.commit()
    return len(avisos)
