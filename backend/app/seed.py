"""Siembra el usuario semilla de fase 1.

Fase 1 es de un solo usuario sin auth de servidor: este usuario fijo es el
`owner_id` de todo lo que se crea. Idempotente: se puede correr las veces que
haga falta.

    python -m app.seed
"""

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db import SessionLocal
from app.models.user import User


async def seed_default_user(session: AsyncSession) -> User:
    """Devuelve el usuario semilla; lo crea si no existe. No hace commit."""
    user = await session.get(User, settings.seed_user_id)
    if user is None:
        user = User(
            id=settings.seed_user_id,
            email=settings.seed_user_email,
            # El acceso se controla con el PIN del cliente; no hay password de
            # servidor en fase 1. Placeholder no usable como hash.
            password_hash="!",
            display_name=settings.seed_user_name,
        )
        session.add(user)
        await session.flush()
    return user


async def main() -> None:
    async with SessionLocal() as session:
        await seed_default_user(session)
        await session.commit()


if __name__ == "__main__":
    asyncio.run(main())
