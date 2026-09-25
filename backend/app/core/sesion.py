"""Sesion del usuario: el JWT que gatea la API (fase 3a).

Dos tokens distintos, a proposito:

- **Sesion** (este): lo emite el login, lo manda el cliente como `Bearer` en cada
  llamada a la API. Firmado con `secret_key`.
- **PowerSync** (`api/v1/sync`): corto (1h), lo firma la API a partir de una
  sesion valida, lo valida el servicio de PowerSync. Firmado con otra clave.

Son distintos porque los valida distinta gente (la API vs PowerSync) y viven
distinto tiempo (la sesion, larga; el de sync, corto y renovable).

**La sesion dura hasta cerrar sesion** (decision del producto): no hay refresh.
Se le pone un `exp` largo (un año) como red — un token no puede ser literalmente
inmortal— pero en la practica se corta con el logout, que borra el token del
dispositivo. Revocacion del lado del servidor (una sesion robada) es hardening
futuro: hoy, detras de Tailscale y con el PIN del dispositivo, el riesgo es bajo.
"""

import time
import uuid

import jwt

from app.core.config import settings

_ALG = "HS256"
_AUD = "mango-sesion"
# Un año. No es "sin vencimiento" —eso seria un token inmortal— pero alcanza
# para que en la practica la sesion la corte el logout, no el reloj.
TTL_SEGUNDOS = 365 * 24 * 3600


def firmar_sesion(user_id: uuid.UUID) -> str:
    ahora = int(time.time())
    payload = {
        "sub": str(user_id),
        "aud": _AUD,
        "iat": ahora,
        "exp": ahora + TTL_SEGUNDOS,
    }
    return jwt.encode(payload, settings.secret_key, algorithm=_ALG)


def leer_sesion(token: str) -> uuid.UUID | None:
    """Devuelve el id del usuario si el token es valido; None si no
    (firma mala, vencido, audiencia equivocada, `sub` que no es UUID)."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[_ALG], audience=_AUD)
        return uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        return None
