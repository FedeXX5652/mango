"""Operaciones sobre el propio usuario (preferencias, apariencia, auth)."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserUpdate


async def por_username(session: AsyncSession, username: str) -> User | None:
    """Busca por username para el login. Case-insensitive: 'Yo' y 'yo' son el
    mismo, que es lo que espera cualquiera al escribir su nombre."""
    stmt = select(User).where(User.username.ilike(username.strip()))
    return (await session.execute(stmt)).scalar_one_or_none()


async def update_user(session: AsyncSession, user: User, data: UserUpdate) -> User:
    # exclude_unset distingue "no lo mando" de "lo mando en null": mandar
    # `fx_manual: null` tiene que borrar la lista, no dejarla como estaba.
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await session.commit()
    await session.refresh(user)
    return user
