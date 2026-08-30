import uuid
from collections.abc import AsyncGenerator
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.api.deps import get_current_user, get_current_user_id
from app.core.config import settings
from app.db import get_session
from app.main import app
from app.models.user import User


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    """Cliente HTTP contra la app en memoria (sin levantar servidor ni tocar DB)."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def conn() -> AsyncGenerator[AsyncConnection, None]:
    """Conexion a la DB real dentro de una transaccion que SIEMPRE se revierte.

    Cada prueba corre aislada: lo que inserta no persiste. Requiere Postgres
    levantado (make dev) con las migraciones aplicadas (make migrate).

    El engine se crea por prueba con NullPool: asi la conexion asyncpg queda
    atada al event loop de la prueba y no se reusa entre loops."""
    test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    async with test_engine.connect() as connection:
        trans = await connection.begin()
        try:
            yield connection
        finally:
            await trans.rollback()
    await test_engine.dispose()


@pytest.fixture
async def session() -> AsyncGenerator[AsyncSession, None]:
    """AsyncSession sobre una transaccion que se revierte al final.

    Los commit() de la sesion caen en un SAVEPOINT (join_transaction_mode), asi
    que nada persiste entre pruebas aunque el codigo bajo prueba haga commit."""
    test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    async with test_engine.connect() as connection:
        trans = await connection.begin()
        maker = async_sessionmaker(
            bind=connection,
            expire_on_commit=False,
            join_transaction_mode="create_savepoint",
        )
        async with maker() as s:
            yield s
        await trans.rollback()
    await test_engine.dispose()


@pytest.fixture
async def api() -> AsyncGenerator[SimpleNamespace, None]:
    """Cliente HTTP contra la app real, con la DB aislada en una transaccion
    que se revierte.

    Cada prueba corre como un USUARIO FRESCO (no el semilla): asi los reportes y
    saldos, que agregan sobre 'el usuario actual', no ven datos preexistentes de
    la DB de dev ni de otras pruebas. Total aislamiento.

    Devuelve un namespace con `.client`, `.session` (para insertar datos de
    apoyo) y `.owner_id` (el usuario de la prueba)."""
    test_engine = create_async_engine(settings.database_url, poolclass=NullPool)
    connection = await test_engine.connect()
    trans = await connection.begin()
    maker = async_sessionmaker(
        bind=connection,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    session = maker()

    owner_id = uuid.uuid4()
    user = User(
        id=owner_id,
        email=f"{owner_id}@test.local",
        password_hash="!",
        display_name="Test",
    )
    session.add(user)
    await session.flush()
    await session.refresh(user)  # carga los server_default (theme_id, etc.)

    async def _override_get_session() -> AsyncGenerator[AsyncSession, None]:
        yield session

    app.dependency_overrides[get_session] = _override_get_session
    app.dependency_overrides[get_current_user_id] = lambda: owner_id
    app.dependency_overrides[get_current_user] = lambda: user

    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    try:
        yield SimpleNamespace(client=client, session=session, owner_id=owner_id)
    finally:
        await client.aclose()
        app.dependency_overrides.clear()
        await session.close()
        await trans.rollback()
        await connection.close()
        await test_engine.dispose()
