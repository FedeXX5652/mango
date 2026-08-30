from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncConnection, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.main import app


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
