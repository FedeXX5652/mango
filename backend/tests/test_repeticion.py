"""Motor de repeticion de los recordatorios (0030).

Corre los casos compartidos con el cliente (frontend/src/lib/repeticion.casos.json):
si el telefono y el servidor no calculan las mismas fechas, el calendario y los
avisos no coinciden.
"""

import json
from datetime import date
from pathlib import Path

import pytest

from app.services.repeticion import Regla, id_ciclo, ocurrencias, siguiente

CASOS = json.loads(
    (Path(__file__).resolve().parents[2] / "frontend/src/lib/repeticion.casos.json").read_text(
        encoding="utf-8"
    )
)


def _regla(datos: dict) -> Regla:
    fechas = {"start_date", "until_date"}
    return Regla(**{k: date.fromisoformat(v) if k in fechas and v else v for k, v in datos.items()})


def _f(texto: str) -> date:
    return date.fromisoformat(texto)


@pytest.mark.parametrize("caso", CASOS["ocurrencias"], ids=lambda c: c["nombre"])
def test_ocurrencias(caso: dict) -> None:
    obtenido = ocurrencias(_regla(caso["regla"]), _f(caso["desde"]), _f(caso["hasta"]))
    assert [[o.nominal.isoformat(), o.vence.isoformat()] for o in obtenido] == caso["esperado"]


@pytest.mark.parametrize("caso", CASOS["siguiente"], ids=lambda c: c["nombre"])
def test_siguiente(caso: dict) -> None:
    o = siguiente(_regla(caso["regla"]), _f(caso["desde"]))
    assert (None if o is None else [o.nominal.isoformat(), o.vence.isoformat()]) == caso["esperado"]


@pytest.mark.parametrize("caso", CASOS["ids"], ids=lambda c: c["nominal"])
def test_id_del_ciclo(caso: dict) -> None:
    assert str(id_ciclo(caso["reminder_id"], _f(caso["nominal"]))) == caso["id"]
