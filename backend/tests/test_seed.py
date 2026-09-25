"""Usuario semilla y siembra de categorías (Inc 2, actualizado en fase 3a).

La auth por token (login, `get_current_user` con Bearer) se prueba en
`tests/api/test_auth.py`: este archivo cubre solo la siembra.
"""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.seguridad import verificar
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


async def test_seed_user_arranca_con_clave_temporal(
    session: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    # El semilla nace con username, clave temporal usable y must_change: se
    # entra y el cliente obliga a cambiarla (fase 3a).
    #
    # Se apunta el id a uno fresco: el semilla real ya existe en la DB de dev
    # (creado en fase 1) y `seed_default_user` lo devolveria tal cual, sin la
    # clave nueva. `users` no tiene owner_id, asi que el fixture no lo aisla.
    monkeypatch.setattr(settings, "seed_user_id", uuid.uuid4())
    monkeypatch.setattr(settings, "seed_user_username", f"seed-{uuid.uuid4()}")
    monkeypatch.setattr(settings, "seed_user_email", f"{uuid.uuid4()}@test.local")
    user = await seed_default_user(session)
    assert user.username == settings.seed_user_username
    assert user.must_change_password is True
    assert verificar(settings.seed_user_password, user.password_hash)


async def test_seed_categories_idempotent(session: AsyncSession) -> None:
    # Usuario fresco: el arbol no depende del estado de la DB de dev.
    owner = uuid.uuid4()
    session.add(
        User(
            id=owner,
            username=f"fresh-{owner}",
            email=f"{owner}@test.local",
            password_hash="!",
            display_name="Fresh",
        )
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
