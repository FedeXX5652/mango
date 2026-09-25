"""Reset de clave sin mail (fase 3a).

El reemplazo del "olvidé mi contraseña" por mail: quien administra la instancia
le pone una clave temporal a alguien y le marca `must_change_password`. La
persona entra con esa clave y el cliente la obliga a cambiarla antes de hacer
nada. Sin ventana de cuenta sin clave, sin endpoint que enumere usuarios (ver
decision de fase 3a en ESPECIFICACION §7).

    python -m app.reset_password <username> [clave-temporal]

Sin clave, se genera una al azar y se imprime. Corre en el servidor: quien tiene
acceso a esto ya es el admin.
"""

import asyncio
import secrets
import sys

from app.core.seguridad import hashear
from app.crud.user import por_username
from app.db import SessionLocal


async def resetear(username: str, temporal: str) -> None:
    async with SessionLocal() as session:
        user = await por_username(session, username)
        if user is None:
            print(f"No existe el usuario '{username}'.", file=sys.stderr)
            raise SystemExit(1)
        user.password_hash = hashear(temporal)
        user.must_change_password = True
        await session.commit()
        print(f"Listo. '{user.username}' entra con la clave temporal y debe cambiarla al entrar.")
        print(f"Clave temporal: {temporal}")


def main() -> None:
    if len(sys.argv) < 2:
        print("Uso: python -m app.reset_password <username> [clave-temporal]", file=sys.stderr)
        raise SystemExit(2)
    username = sys.argv[1]
    temporal = sys.argv[2] if len(sys.argv) > 2 else secrets.token_urlsafe(9)
    asyncio.run(resetear(username, temporal))


if __name__ == "__main__":
    main()
