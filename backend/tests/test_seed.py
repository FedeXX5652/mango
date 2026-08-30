"""Usuario semilla y dependencia current_user (Inc 2)."""

from fastapi import HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_id
from app.core.config import settings
from app.models.user import User
from app.seed import seed_default_user


async def test_seed_is_idempotent(session: AsyncSession) -> None:
    u1 = await seed_default_user(session)
    u2 = await seed_default_user(session)
    assert u1.id == u2.id == settings.seed_user_id

    count = (
        await session.execute(
            select(func.count()).select_from(User).where(User.id == settings.seed_user_id)
        )
    ).scalar_one()
    assert count == 1


async def test_get_current_user_returns_seed(session: AsyncSession) -> None:
    await seed_default_user(session)
    user = await get_current_user(session)
    assert user.id == settings.seed_user_id
    assert user.email == settings.seed_user_email


async def test_get_current_user_missing_raises(session: AsyncSession) -> None:
    # Aseguro que no este (por si la semilla ya corrio contra la DB de dev).
    await session.execute(delete(User).where(User.id == settings.seed_user_id))
    try:
        await get_current_user(session)
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("se esperaba HTTPException 503")


def test_get_current_user_id_is_stable() -> None:
    assert get_current_user_id() == settings.seed_user_id
