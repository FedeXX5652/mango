"""Banco de compatibilidad: payloads de un cliente contra la API de hoy.

Corre con `make test`. Cada fixture de `tests/compat/payloads/` es una secuencia
de escrituras tal cual las produce el conector del cliente. La regla de
expandir/contraer (0012) dice que un cliente una version atras tiene que seguir
subiendo bien; este banco es donde eso se verifica.

Hoy hay un solo fixture, el baseline (la forma actual). Cuando llegue un cambio
no aditivo —el renombre email->username de fase 3a— se agrega el fixture con la
forma vieja y una prueba que afirma que el servidor nuevo lo sigue aceptando (o
que el normalizador lo traduce). El banco ya esta; solo se le suman casos.
"""

from types import SimpleNamespace

import pytest

from tests.compat.replay import cargar, reproducir


async def test_baseline_sube_entero(api: SimpleNamespace) -> None:
    # La forma que produce el cliente HOY entra sin un solo rechazo. Es la
    # linea de base: si esto falla, el banco esta roto, no el contrato.
    resultados = await reproducir(api, "v1_baseline.json")
    for e, resp in resultados:
        assert resp.status_code < 300, f"{e.tabla}/{e.op} devolvio {resp.status_code}: {resp.text}"


async def test_baseline_deja_el_dato_correcto(api: SimpleNamespace) -> None:
    # No solo que entre: que quede lo que se mando. El PATCH del final tiene que
    # ganar sobre el PUT.
    await reproducir(api, "v1_baseline.json")
    tx = await api.fila("transactions", "33333333-3333-4333-8333-333333333333")
    assert tx is not None
    assert tx["amount"] == 230272
    assert tx["payee"] == "Supermercado del barrio"
    assert tx["status"] == "confirmed"


@pytest.mark.parametrize("fixture", ["v1_baseline.json"])
async def test_fixtures_son_secuencias_validas(fixture: str) -> None:
    # Un fixture mal escrito (sin id, sin tabla) tiene que fallar como error de
    # fixture, no como un rechazo del servidor que confundiria el diagnostico.
    escrituras = cargar(fixture)
    assert len(escrituras) > 0
    for e in escrituras:
        assert e.tabla and e.op in ("PUT", "PATCH", "DELETE") and e.id
