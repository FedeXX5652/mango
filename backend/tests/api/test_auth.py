"""Autenticación de fase 3a: login, cambio de clave, protección de la API.

Estas pruebas NO usan el override de auth del fixture `api` (que saltea el
token): montan un cliente que ejercita el camino real del Bearer, porque es
justo lo que hay que verificar.
"""

import uuid
from collections.abc import AsyncGenerator
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.limite_intentos import MAX_INTENTOS, limite
from app.core.seguridad import hashear
from app.db import get_session
from app.main import app
from app.models.user import User


@pytest.fixture
async def entorno() -> AsyncGenerator[SimpleNamespace, None]:
    """Cliente contra la app real, con un usuario de clave conocida y SIN el
    override de auth: el token se obtiene de verdad por /auth/login."""
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    conn = await engine.connect()
    trans = await conn.begin()
    maker = async_sessionmaker(
        bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint"
    )
    session = maker()

    uid = uuid.uuid4()
    username = f"user-{uid}"
    session.add(
        User(
            id=uid,
            username=username,
            email=f"{uid}@test.local",
            password_hash=hashear("clave-correcta"),
            display_name="Test",
        )
    )
    await session.flush()

    async def _override() -> AsyncGenerator[AsyncSession, None]:
        yield session

    app.dependency_overrides[get_session] = _override
    # A proposito NO se sobreescriben get_current_user*: se prueba el token real.
    transport = ASGITransport(app=app)
    client = AsyncClient(transport=transport, base_url="http://test")
    limite._por_clave.clear()  # aislar el rate limit entre pruebas
    try:
        yield SimpleNamespace(client=client, session=session, uid=uid, username=username)
    finally:
        await client.aclose()
        app.dependency_overrides.clear()
        await session.close()
        await trans.rollback()
        await conn.close()
        await engine.dispose()


async def _login(e: SimpleNamespace, password: str):
    return await e.client.post(
        "/api/v1/auth/login", json={"username": e.username, "password": password}
    )


async def test_login_ok_devuelve_token(entorno: SimpleNamespace) -> None:
    resp = await _login(entorno, "clave-correcta")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["token"]
    assert body["must_change_password"] is False


async def test_login_clave_mala_401(entorno: SimpleNamespace) -> None:
    resp = await _login(entorno, "cualquier-otra")
    assert resp.status_code == 401


async def test_login_usuario_inexistente_mismo_error(entorno: SimpleNamespace) -> None:
    # No revela si el usuario existe: mismo 401 que una clave mala.
    resp = await entorno.client.post(
        "/api/v1/auth/login", json={"username": "no-existe", "password": "x"}
    )
    assert resp.status_code == 401


async def test_login_es_case_insensitive_en_username(entorno: SimpleNamespace) -> None:
    resp = await entorno.client.post(
        "/api/v1/auth/login",
        json={"username": entorno.username.upper(), "password": "clave-correcta"},
    )
    assert resp.status_code == 200


async def test_rate_limit_bloquea_tras_muchos_fallos(entorno: SimpleNamespace) -> None:
    for _ in range(MAX_INTENTOS):
        assert (await _login(entorno, "mal")).status_code == 401
    # El siguiente, aun con la clave BUENA, cae por el bloqueo.
    resp = await _login(entorno, "clave-correcta")
    assert resp.status_code == 429


async def test_endpoint_protegido_sin_token_401(entorno: SimpleNamespace) -> None:
    # /sync/token exige sesion: sin Bearer, 401 (no el seed de antes).
    resp = await entorno.client.get("/api/v1/sync/token")
    assert resp.status_code == 401


async def test_token_de_login_abre_la_api(entorno: SimpleNamespace) -> None:
    token = (await _login(entorno, "clave-correcta")).json()["token"]
    resp = await entorno.client.get(
        "/api/v1/sync/token", headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 200
    assert resp.json()["token"]


async def test_cambio_de_clave(entorno: SimpleNamespace) -> None:
    token = (await _login(entorno, "clave-correcta")).json()["token"]
    h = {"Authorization": f"Bearer {token}"}
    resp = await entorno.client.post(
        "/api/v1/auth/change-password",
        json={"actual": "clave-correcta", "nueva": "clave-nueva-larga"},
        headers=h,
    )
    assert resp.status_code == 204
    # La vieja ya no entra; la nueva sí.
    assert (await _login(entorno, "clave-correcta")).status_code == 401
    assert (await _login(entorno, "clave-nueva-larga")).status_code == 200


async def test_cambio_con_actual_incorrecta_400(entorno: SimpleNamespace) -> None:
    token = (await _login(entorno, "clave-correcta")).json()["token"]
    resp = await entorno.client.post(
        "/api/v1/auth/change-password",
        json={"actual": "no-es-la-actual", "nueva": "clave-nueva-larga"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


async def test_nueva_clave_muy_corta_422(entorno: SimpleNamespace) -> None:
    token = (await _login(entorno, "clave-correcta")).json()["token"]
    resp = await entorno.client.post(
        "/api/v1/auth/change-password",
        json={"actual": "clave-correcta", "nueva": "corta"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 422
