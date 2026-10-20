"""Planificador del servidor (1.4.0): tareas que corren solas, sin que nadie abra
la app.

Un solo proceso dentro del backend (no un servicio aparte): arranca con la app
(`main.lifespan`), despierta cada minuto y tambien al instante cuando se confirma
un aviso nuevo en la base (`despertar`). Cada tarea corre con un candado de
Postgres, asi que nunca hay dos a la vez aunque hubiera mas de un backend.

Tareas:
- `avisos`: despacha por push los avisos de la bandeja que todavia no salieron.
  Lo que tiene mas de `push_max_antiguedad_h` (heimdall estuvo apagado) se marca
  sin mandar: queda en la bandeja y no hay catarata al volver.
- `cotizaciones`: la serie de cotizaciones contra el dolar (0031): completa la
  historia que falte y trae lo del dia, aunque nadie abra la app.
- `recordatorios`: los avisos del calendario de pagos (0030), a su hora y con el
  seguimiento si no se responde.
- `grupos`: un gasto compartido nuevo y un tope del grupo superado (1.7.0, ver
  aviso_grupos).
"""

import asyncio
import logging
import time
import zlib
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import SessionLocal, engine
from app.models.user import Notification
from app.services import aviso_grupos, aviso_pagos, aviso_recordatorios, push
from app.services import fx as servicio_fx

log = logging.getLogger(__name__)

_despertar = asyncio.Event()


def despertar() -> None:
    """Que el planificador mire ya los avisos (lo llama `notification.crear`
    despues del commit)."""
    _despertar.set()


async def despachar_avisos(session: AsyncSession) -> int:
    """Manda por push lo pendiente. Devuelve cuantos avisos se procesaron."""
    limite = datetime.now(UTC) - timedelta(hours=settings.push_max_antiguedad_h)
    # Lo viejo no sale por push: queda en la bandeja.
    await session.execute(
        update(Notification)
        .where(Notification.pushed_at.is_(None), Notification.created_at < limite)
        .values(pushed_at=func.now())
    )
    pendientes = (
        (
            await session.execute(
                select(Notification)
                .where(Notification.pushed_at.is_(None), Notification.deleted_at.is_(None))
                .order_by(Notification.created_at)
                .limit(100)
            )
        )
        .scalars()
        .all()
    )
    for aviso in pendientes:
        # Los de un vencimiento llevan los botones "Ya lo pague" y "Mas tarde".
        mensaje = (
            push.mensaje_de(aviso)
            | await aviso_recordatorios.acciones_de(session, aviso)
            # El de un pago a confirmar, "Pagada con <cuenta>" (0032).
            | await aviso_pagos.acciones_de(session, aviso)
        )
        # El permiso de los botones queda en la base ANTES de mandarlo: si la base
        # falla aca, no sale un permiso que no existe.
        await session.flush()
        await push.enviar(session, aviso.user_id, mensaje, push.familia_de(aviso.type))
        # Tambien si no habia a donde mandarlo: un dispositivo que se suscriba
        # despues no tiene que recibir lo de antes.
        aviso.pushed_at = func.now()
    await session.commit()
    return len(pendientes)


@dataclass(frozen=True)
class Tarea:
    nombre: str
    cada_s: int
    correr: Callable[[AsyncSession], Awaitable[int]]
    # Si un aviso nuevo la despierta antes de tiempo.
    al_despertar: bool = False


TAREAS = (
    Tarea("avisos", 60, despachar_avisos, al_despertar=True),
    Tarea("cotizaciones", 3600, servicio_fx.tarea),
    # Calendario de pagos (0030): crea los avisos de los vencimientos; los manda
    # `avisos` en la vuelta siguiente (o al toque: despiertan al confirmarse).
    Tarea("recordatorios", 60, aviso_recordatorios.avisar),
    # Gasto compartido nuevo y tope superado (1.7.0): mismo camino, los manda
    # `avisos`.
    Tarea("grupos", 60, aviso_grupos.avisar),
)


def _clave_candado(nombre: str) -> int:
    # Entero estable por tarea para pg_try_advisory_lock.
    return zlib.crc32(f"mango:{nombre}".encode())


async def correr_tarea(tarea: Tarea) -> None:
    clave = _clave_candado(tarea.nombre)
    # El candado es de la conexion: se toma y se suelta en la misma, apartada
    # mientras corre la tarea. La sesion de la tarea no sirve para esto: en cada
    # commit devuelve su conexion al pool y el unlock podria caer en otra.
    async with engine.connect() as candado:
        tomado = (
            await candado.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": clave})
        ).scalar()
        await candado.commit()
        if not tomado:
            return
        try:
            async with SessionLocal() as session:
                await tarea.correr(session)
        except Exception:  # noqa: BLE001 - una tarea que falla no frena al resto
            log.exception("la tarea %s fallo", tarea.nombre)
        finally:
            await candado.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": clave})
            await candado.commit()


async def correr() -> None:
    """El loop. Corre hasta que la app se apaga (la tarea se cancela)."""
    # -inf y no 0: `monotonic` cuenta desde que arranco el equipo. Con heimdall
    # recien prendido, 0 hacia esperar una hora a la tarea de cada hora (1.8.0).
    ultima: dict[str, float] = {t.nombre: float("-inf") for t in TAREAS}
    despertado = False
    while True:
        ahora = time.monotonic()
        for t in TAREAS:
            if ahora - ultima[t.nombre] >= t.cada_s or (despertado and t.al_despertar):
                try:
                    await correr_tarea(t)
                except Exception:  # noqa: BLE001 - sin base un rato: se reintenta
                    log.exception("el planificador no pudo correr %s", t.nombre)
                ultima[t.nombre] = time.monotonic()
        try:
            await asyncio.wait_for(_despertar.wait(), timeout=60)
        except TimeoutError:
            pass
        despertado = _despertar.is_set()
        _despertar.clear()
