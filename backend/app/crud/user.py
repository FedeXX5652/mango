"""Operaciones sobre el propio usuario (preferencias y apariencia)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.schemas.user import UserUpdate


async def update_user(session: AsyncSession, user: User, data: UserUpdate) -> User:
    # exclude_unset distingue "no lo mando" de "lo mando en null": mandar
    # `fx_manual: null` tiene que borrar la lista, no dejarla como estaba.
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    await session.commit()
    await session.refresh(user)
    return user
