"""Autenticación (fase 3a): login y cambio de clave.

No hay registro: las cuentas las crea quien administra la instancia (seed /
reset), porque es self-hosted y familiar (ver ESPECIFICACION §7). Tampoco hay
mail: la identidad es username + clave.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.limite_intentos import limite
from app.core.seguridad import hashear, necesita_rehash, verificar
from app.core.sesion import firmar_sesion
from app.crud import user as crud
from app.db import get_session
from app.models.user import User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    username: str
    password: str


class LoginOut(BaseModel):
    token: str
    # El cliente lo usa para forzar el cambio antes de dejar hacer nada.
    must_change_password: bool


class CambioClaveIn(BaseModel):
    # La actual no se pide si el usuario esta en must_change_password: entro con
    # la temporal y ya la tiene "usada". Igual se pide siempre para el caso
    # normal (cambiar la clave estando adentro).
    actual: str
    nueva: str = Field(min_length=8)


# Mensaje unico para "usuario o clave mal": no revela cual de los dos fallo.
_CREDENCIALES = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuario o contraseña incorrectos"
)


@router.post("/login", response_model=LoginOut)
async def login(data: LoginIn, session: AsyncSession = Depends(get_session)) -> LoginOut:
    # El limite es por username: frena la prueba de claves contra una cuenta.
    clave_limite = data.username.strip().lower()
    if limite.bloqueado(clave_limite):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Demasiados intentos. Esperá unos minutos.",
        )

    user = await crud.por_username(session, data.username)
    # Se verifica aunque el usuario no exista, para no filtrar por el tiempo de
    # respuesta cuales usernames existen (verificar contra un hash vacio falla).
    hash_guardado = user.password_hash if user else ""
    if not verificar(data.password, hash_guardado):
        limite.registrar_fallo(clave_limite)
        raise _CREDENCIALES

    assert user is not None
    limite.registrar_exito(clave_limite)

    # Los defaults de argon2 suben con el tiempo: si el hash quedo viejo, se
    # regenera ahora que tenemos la clave en claro.
    if necesita_rehash(user.password_hash):
        user.password_hash = hashear(data.password)
        await session.commit()

    return LoginOut(token=firmar_sesion(user.id), must_change_password=user.must_change_password)


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def cambiar_clave(
    data: CambioClaveIn,
    current: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    if not verificar(data.actual, current.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="La contraseña actual no coincide"
        )
    current.password_hash = hashear(data.nueva)
    current.must_change_password = False
    await session.commit()
