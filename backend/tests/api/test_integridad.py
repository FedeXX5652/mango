"""Un error de integridad de la base llega al cliente distinto segun que sea
(0011): un id repetido es un reintento ya aplicado (409); cualquier otra
violacion es un rechazo (422), que va a "Cambios que no se guardaron" en vez de
perderse en silencio como "ya aplicado"."""

import json
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from app.main import _integrity_handler


class _Pg(Exception):
    def __init__(self, sqlstate: str, constraint_name: str) -> None:
        self.sqlstate = sqlstate
        self.constraint_name = constraint_name


def _error(sqlstate: str, restriccion: str) -> IntegrityError:
    return IntegrityError("INSERT ...", {}, _Pg(sqlstate, restriccion))


async def _status(exc: IntegrityError) -> tuple[int, str]:
    r = await _integrity_handler(None, exc)  # type: ignore[arg-type]
    return r.status_code, json.loads(r.body)["detail"]


async def test_id_repetido_es_ya_aplicado() -> None:
    assert (await _status(_error("23505", "accounts_pkey")))[0] == 409


async def test_otra_violacion_se_rechaza() -> None:
    # Unico que no es la clave primaria, una clave foranea, un CHECK.
    for estado, restriccion in (
        ("23505", "accounts_saldo_moneda_uniq"),
        ("23503", "transactions_category_id_fkey"),
        ("23514", "accounts_tarjeta_chk"),
    ):
        codigo, detalle = await _status(_error(estado, restriccion))
        assert codigo == 422, restriccion
        assert "no" in detalle or "choca" in detalle


async def test_con_el_driver_real(conn: AsyncConnection) -> None:
    # Lo de arriba arma la excepcion a mano; esto confirma que asyncpg, a traves
    # de SQLAlchemy, trae el codigo y la restriccion donde se los busca.
    uid = uuid.uuid4()
    alta = text(
        "INSERT INTO users (id, username, password_hash, display_name) VALUES (:id, :u, '!', 'X')"
    )
    await conn.execute(alta, {"id": uid, "u": f"integridad-{uid.hex[:8]}"})

    async def choque(params: dict) -> IntegrityError:
        with pytest.raises(IntegrityError) as e:
            async with conn.begin_nested():
                await conn.execute(alta, params)
        return e.value

    mismo_id = await choque({"id": uid, "u": f"otro-{uid.hex[:8]}"})
    assert (await _status(mismo_id))[0] == 409
    mismo_usuario = await choque({"id": uuid.uuid4(), "u": f"INTEGRIDAD-{uid.hex[:8]}"})
    assert (await _status(mismo_usuario))[0] == 422
