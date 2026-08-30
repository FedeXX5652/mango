"""Usuario semilla y dependencia current_user (Inc 2)."""

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_id
from app.core.config import settings
from app.models.category import Category
from app.models.user import User
from app.seed import seed_default_categories, seed_default_user


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


async def test_get_current_user_missing_raises(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Apunto el id semilla a uno inexistente en vez de borrar el real (que ya
    # tiene datos que lo referencian por FK).
    monkeypatch.setattr(settings, "seed_user_id", uuid.uuid4())
    try:
        await get_current_user(session)
    except HTTPException as exc:
        assert exc.status_code == 503
    else:
        raise AssertionError("se esperaba HTTPException 503")


def test_get_current_user_id_is_stable() -> None:
    assert get_current_user_id() == settings.seed_user_id


async def test_seed_categories_idempotent(session: AsyncSession) -> None:
    # Usuario fresco: el arbol no depende del estado de la DB de dev.
    owner = uuid.uuid4()
    session.add(
        User(id=owner, email=f"{owner}@test.local", password_hash="!", display_name="Fresh")
    )
    await session.flush()

    created = await seed_default_categories(session, owner)
    assert created == 21  # 8 principales + 13 subcategorias

    again = await seed_default_categories(session, owner)
    assert again == 0  # ya existian: no duplica

    total = (
        await session.execute(
            select(func.count())
            .select_from(Category)
            .where(Category.owner_id == owner, Category.deleted_at.is_(None))
        )
    ).scalar_one()
    assert total == 21
