"""Envio de notificaciones push (1.4.0, Web Push con VAPID).

Un aviso de la bandeja (0019) tambien sale por push a los dispositivos del
usuario que lo aceptan. Cada mensaje dice a que pertenece (el titulo lo trae) y
usa el logo con fondo transparente: `icon` el logo, `badge` el monocromo para
la barra de Android.
"""

import asyncio
import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from py_vapid import Vapid02
from pywebpush import WebPushException, webpush_async
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.crud import push as crud_push
from app.models.push import PushSubscription
from app.models.user import Notification

log = logging.getLogger(__name__)

ICONO = "/icons/png/mango-512.png"
INSIGNIA = "/icons/png/mango-mono-96.png"

# Familia de cada tipo de aviso: un dispositivo puede aceptar unas y otras no.
FAMILIA = {
    "pago_recibido": "grupos",
    "pago_deshecho": "grupos",
    "miembro_agregado": "grupos",
    # Calendario de pagos (0030).
    "recordatorio": "recordatorios",
}

# Respuestas del servicio de push que dicen que la suscripcion ya no sirve:
# 404/410, el dispositivo ya no existe; 401/403, no acepta las claves del
# servidor (se cambiaron). Se da de baja; si el dispositivo sigue vivo, la rehace
# solo cuando vuelve a abrir la app (lib/push.ts, refrescarSuscripcion).
_BAJA = frozenset({401, 403, 404, 410})

# Salvo en una suscripcion recien creada: el servicio de push puede no conocerla
# todavia y dar 404/410 unos segundos (medido con FCM, 2026-10-03: 410 durante
# 5 a 10 s y despues 201, con el mismo endpoint). Mientras es nueva, un 404/410
# se reintenta (hasta 20 s) y nunca la da de baja.
GRACIA = timedelta(minutes=5)
_REINTENTOS_S = (2, 3, 5, 10)


def _es_nueva(s: PushSubscription) -> bool:
    return s.created_at is None or s.created_at > datetime.now(UTC) - GRACIA


def familia_de(tipo: str) -> str:
    """Un tipo que no esta en FAMILIA es su propia familia: les llega a los
    dispositivos que aceptan todo, nunca a uno que eligio otras."""
    return FAMILIA.get(tipo, tipo)


# (info de la suscripcion, mensaje cifrable) -> codigo HTTP del servicio de push.
Enviador = Callable[[dict, str], Awaitable[int]]


def configurado() -> bool:
    return bool(settings.vapid_public_key and settings.vapid_private_key and settings.vapid_subject)


def mensaje_de(aviso: Notification) -> dict:
    """Lo que viaja: el service worker arma la notificacion con esto. El `tag`
    agrupa por origen: un segundo aviso del mismo origen reemplaza al primero."""
    return {
        "id": str(aviso.id),
        "titulo": aviso.title,
        "cuerpo": aviso.body,
        "link": aviso.link or "/",
        "tag": f"{aviso.type}:{aviso.link or aviso.id}",
        "icono": ICONO,
        "insignia": INSIGNIA,
    }


@lru_cache(maxsize=1)
def _vapid(privada: str) -> Vapid02:
    return Vapid02.from_raw(privada.encode())


async def _enviar_real(info: dict, data: str) -> int:
    clave = _vapid(settings.vapid_private_key)
    try:
        resp = await webpush_async(
            info,
            data=data,
            vapid_private_key=clave,
            vapid_claims={"sub": settings.vapid_subject},
            ttl=24 * 3600,
            timeout=10,
        )
    except WebPushException as exc:
        resp = exc.response
        if resp is None:
            log.warning("push sin respuesta: %s", exc)
            return 0
        # Codigo, motivo y cuerpo: por que el servicio no lo acepto.
        log.warning("push rechazado: %s", exc.message)
    return int(getattr(resp, "status", None) or getattr(resp, "status_code", 0) or 0)


# Las pruebas lo reemplazan: no se sale a ningun servicio de push real.
enviar_mensaje: Enviador = _enviar_real


async def enviar(
    session: AsyncSession,
    user_id: uuid.UUID,
    mensaje: dict,
    familia: str | None,
    *,
    endpoint: str | None = None,
) -> int:
    """Manda `mensaje` a los dispositivos del usuario que aceptan esa familia (o
    solo a `endpoint`). Una suscripcion que ya no sirve (`_BAJA`) se da de baja.
    No hace commit. Devuelve cuantos lo recibieron."""
    if not configurado():
        return 0
    subs = await crud_push.del_usuario(session, user_id, familia)
    if endpoint is not None:
        subs = [s for s in subs if s.endpoint == endpoint]
    data = json.dumps(mensaje, ensure_ascii=False)
    enviados = 0
    for s in subs:
        info = {"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}}
        nueva = _es_nueva(s)
        try:
            codigo = await enviar_mensaje(info, data)
            for espera in _REINTENTOS_S if nueva else ():
                if codigo not in (404, 410):
                    break
                await asyncio.sleep(espera)
                codigo = await enviar_mensaje(info, data)
        except Exception:  # noqa: BLE001 - un dispositivo no frena a los demas
            log.exception("push fallo para la suscripcion %s", s.id)
            continue
        if 200 <= codigo < 300:
            enviados += 1
        elif codigo in _BAJA and not nueva:
            s.deleted_at = func.now()
        else:
            log.warning("push devolvio %s para la suscripcion %s", codigo, s.id)
    return enviados
