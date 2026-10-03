"""Planificador del servidor (1.4.0): el candado de cada tarea y el loop."""

import asyncio

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.services import planificador


@pytest.fixture
async def motor(monkeypatch) -> AsyncEngine:
    """Un engine con pool de verdad (no NullPool): el candado depende de que
    conexion toca cada consulta."""
    m = create_async_engine(settings.database_url)
    monkeypatch.setattr(planificador, "engine", m)
    monkeypatch.setattr(planificador, "SessionLocal", async_sessionmaker(m, expire_on_commit=False))
    yield m
    await m.dispose()


async def _candados_tomados(motor: AsyncEngine, nombre: str) -> int:
    async with motor.connect() as c:
        return (
            await c.execute(
                text("SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objid = :k"),
                {"k": planificador._clave_candado(nombre)},
            )
        ).scalar_one()


async def test_el_candado_se_suelta_aunque_la_tarea_haga_commit(motor: AsyncEngine) -> None:
    async def tarea(session) -> int:
        # El commit devuelve la conexion de la sesion al pool, y quedan dos
        # conexiones libres: un unlock por la sesion caeria en la otra.
        await session.execute(text("SELECT 1"))
        await session.commit()
        async with motor.connect() as a, motor.connect() as b:
            await a.execute(text("SELECT 1"))
            await b.execute(text("SELECT 1"))
        return 0

    t = planificador.Tarea("prueba-candado", 60, tarea)
    for _ in range(3):
        await planificador.correr_tarea(t)
    assert await _candados_tomados(motor, t.nombre) == 0


async def test_una_tarea_que_falla_suelta_el_candado(motor: AsyncEngine) -> None:
    corridas = []

    async def tarea(session) -> int:
        corridas.append(1)
        raise RuntimeError("se rompio")

    t = planificador.Tarea("prueba-falla", 60, tarea)
    await planificador.correr_tarea(t)
    await planificador.correr_tarea(t)
    assert len(corridas) == 2
    assert await _candados_tomados(motor, t.nombre) == 0


async def test_con_el_candado_tomado_no_corre(motor: AsyncEngine) -> None:
    # Otro backend la esta corriendo: esta vuelta se saltea.
    corridas = []

    async def tarea(session) -> int:
        corridas.append(1)
        return 0

    t = planificador.Tarea("prueba-ocupada", 60, tarea)
    async with motor.connect() as otro:
        await otro.execute(
            text("SELECT pg_advisory_lock(:k)"), {"k": planificador._clave_candado(t.nombre)}
        )
        await planificador.correr_tarea(t)
        await otro.execute(
            text("SELECT pg_advisory_unlock(:k)"), {"k": planificador._clave_candado(t.nombre)}
        )
    assert corridas == []


async def test_un_error_no_frena_al_planificador(monkeypatch) -> None:
    # Por ejemplo la base reiniciandose: el loop sigue y reintenta.
    llamadas = []

    async def sin_base(tarea) -> None:
        llamadas.append(tarea.nombre)
        raise ConnectionError("sin base")

    async def nada(session) -> int:
        return 0

    monkeypatch.setattr(planificador, "_despertar", asyncio.Event())
    monkeypatch.setattr(planificador, "correr_tarea", sin_base)
    monkeypatch.setattr(
        planificador, "TAREAS", (planificador.Tarea("avisos", 60, nada, al_despertar=True),)
    )
    loop = asyncio.create_task(planificador.correr())
    await asyncio.sleep(0.05)
    planificador.despertar()
    await asyncio.sleep(0.05)
    try:
        assert not loop.done()
        assert llamadas == ["avisos", "avisos"]
    finally:
        loop.cancel()
        with pytest.raises(asyncio.CancelledError):
            await loop
