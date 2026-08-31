"""Token de PowerSync.

La app pide aca un JWT HS256 firmado con el secreto compartido; PowerSync lo
valida contra el mismo secreto (JWK 'oct' en service.yaml). En fase 1 el `sub`
es el usuario semilla; en fase 3, tras el login, sera el usuario autenticado.
"""

import base64
import time
import uuid

import jwt
from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user_id
from app.core.config import settings

router = APIRouter(prefix="/sync", tags=["sync"])

_KID = "mango-hs256"
_TTL_SEGUNDOS = 3600


class TokenPowerSync(BaseModel):
    token: str
    powersync_url: str


def _clave() -> bytes:
    # El secreto viaja en base64url (lo mismo que la 'k' del JWK de PowerSync).
    s = settings.powersync_jwt_secret
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def firmar_token(user_id: uuid.UUID) -> str:
    ahora = int(time.time())
    payload = {
        "sub": str(user_id),
        "aud": settings.powersync_jwt_audience,
        "iat": ahora,
        "exp": ahora + _TTL_SEGUNDOS,
    }
    return jwt.encode(payload, _clave(), algorithm="HS256", headers={"kid": _KID})


@router.get("/token", response_model=TokenPowerSync)
async def sync_token(owner_id: uuid.UUID = Depends(get_current_user_id)) -> TokenPowerSync:
    return TokenPowerSync(token=firmar_token(owner_id), powersync_url=settings.powersync_url)
