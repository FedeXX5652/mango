"""Hash de contraseñas con Argon2id (fase 3a).

Hashear **no es encriptar**: no hay vuelta atras ni con la clave del servidor, y
eso es lo que se quiere — ni quien administra puede leer la contraseña de otro
(ver ESPECIFICACION §7).

`password_hash="!"` es el placeholder del usuario semilla antes de tener clave:
no es un hash valido, asi que `verificar` siempre falla contra el. Un usuario
con ese valor no puede entrar hasta que se le ponga una clave real.
"""

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

# Parametros por defecto de argon2-cffi (razonables para 2026). Un solo hasher
# reutilizable: es thread-safe.
_hasher = PasswordHasher()

# Placeholder de "sin clave todavia": ningun hash argon2 empieza asi.
SIN_CLAVE = "!"


def hashear(clave: str) -> str:
    return _hasher.hash(clave)


def verificar(clave: str, hash_guardado: str) -> bool:
    """¿La clave coincide con el hash? Nunca levanta: una clave mala, un hash
    invalido o el placeholder devuelven False."""
    if not hash_guardado or hash_guardado == SIN_CLAVE:
        return False
    try:
        return _hasher.verify(hash_guardado, clave)
    except (VerifyMismatchError, InvalidHashError):
        return False


def necesita_rehash(hash_guardado: str) -> bool:
    """True si el hash quedo con parametros viejos y conviene regenerarlo en el
    proximo login exitoso (los defaults de argon2 suben con el tiempo)."""
    try:
        return _hasher.check_needs_rehash(hash_guardado)
    except InvalidHashError:
        return False
