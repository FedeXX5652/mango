"""Avisos in-app (fase 3b, ver 0019).

Los crea el servidor en eventos; el cliente solo los marca leidos. `crear` no
hace commit: se llama dentro de la transaccion del evento que lo dispara, asi el
aviso y el hecho que lo genera se guardan juntos (o ninguno).
"""

import uuid

from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Notification


def formatear_monto(centavos: int, moneda: str) -> str:
    """Monto legible para el texto del aviso. Formato es-AR simple: separador de
    miles con punto y dos decimales con coma. Las monedas sin centavos (JPY) no
    se dividen; el resto, si."""
    sin_decimales = moneda in {"JPY", "KRW", "CLP", "COP"}
    signo = "-" if centavos < 0 else ""
    if sin_decimales:
        cuerpo = f"{abs(centavos):,}".replace(",", ".")
    else:
        # Con enteros (regla 1): `centavos / 100` era punto flotante.
        entero, resto = divmod(abs(centavos), 100)
        cuerpo = f"{entero:,}".replace(",", ".") + f",{resto:02d}"
    cuerpo = signo + cuerpo
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
    meta: dict | None = None,
) -> Notification:
    aviso = Notification(
        id=uuid.uuid4(), user_id=user_id, type=tipo, title=title, body=body, link=link, meta=meta
    )
    session.add(aviso)
    # Cuando el aviso quede guardado, el planificador lo manda por push al toque
    # (1.4.0), sin esperar al proximo minuto.
    _despertar_al_confirmar(session)
    return aviso


def de_grupo(nombre_grupo: str | None, titulo: str) -> str:
    """Titulo que dice a que grupo pertenece el aviso: "Casa · Te pagaron"."""
    return f"{nombre_grupo} · {titulo}" if nombre_grupo else titulo


def _despertar_al_confirmar(session: AsyncSession) -> None:
    from app.services import planificador

    event.listen(
        session.sync_session, "after_commit", lambda _s: planificador.despertar(), once=True
    )


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
