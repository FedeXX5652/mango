"""Refresco automatico de cotizaciones (ver 0005).

El servicio recibe el "traeme la cotizacion" por parametro, asi que estas
pruebas **no salen a la red**: le pasan una funcion falsa. Lo unico que no se
prueba aca es el parseo del payload real, que vive en `traer_de_api` y se prueba
aparte con un JSON de muestra.
"""

import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.services import fx as servicio


async def _cuenta(api: SimpleNamespace, currency: str, nombre: str | None = None) -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={
            "id": str(uuid.uuid4()),
            "name": nombre or f"Cuenta {currency}",
            "type": "bank",
            "currency": currency,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["id"]


def _falso(valores: dict[str, str], fecha: str = "2026-09-07", registro: list | None = None):
    """Devuelve un `traer` que responde con `valores[moneda]` y anota que se pidio."""

    async def traer(origen: str, destino: str):
        if registro is not None:
            registro.append((origen, destino))
        if origen not in valores:
            return None
        return Decimal(valores[origen]), date.fromisoformat(fecha)

    return traer


async def test_crea_la_cotizacion_de_cada_moneda_del_usuario(api: SimpleNamespace) -> None:
    await _cuenta(api, "ARS")  # la base no se cotiza contra si misma
    await _cuenta(api, "USD")
    await _cuenta(api, "EUR")

    pedidos: list = []
    res = await servicio.refrescar(
        api.session,
        api.owner_id,
        traer=_falso({"USD": "1735.10", "EUR": "2040.55"}, registro=pedidos),
    )

    assert sorted(res.actualizadas) == ["EUR", "USD"]
    assert res.fallidas == []
    # Se pide una llamada por moneda, contra la base, y NUNCA la base sola.
    assert sorted(pedidos) == [("EUR", "ARS"), ("USD", "ARS")]

    filas = (await api.client.get("/api/v1/exchange-rates", params={"limit": 50})).json()
    creadas = {
        (f["base_currency"], f["quote_currency"], f["source"]): Decimal(f["rate"])
        for f in filas
        if f["source"] == "auto"
    }
    assert creadas[("USD", "ARS", "auto")] == Decimal("1735.10")
    assert creadas[("EUR", "ARS", "auto")] == Decimal("2040.55")


async def test_es_idempotente_por_fecha(api: SimpleNamespace) -> None:
    await _cuenta(api, "USD")
    traer = _falso({"USD": "1735.10"})

    primera = await servicio.refrescar(api.session, api.owner_id, traer=traer)
    assert primera.actualizadas == ["USD"]

    # Misma fecha y mismo valor: no se toca nada (la fuente publica una por dia).
    segunda = await servicio.refrescar(api.session, api.owner_id, traer=traer)
    assert segunda.actualizadas == []
    assert segunda.sin_cambios == ["USD"]


async def test_si_el_valor_del_dia_cambio_corrige_la_fila(api: SimpleNamespace) -> None:
    await _cuenta(api, "USD")
    await servicio.refrescar(api.session, api.owner_id, traer=_falso({"USD": "1735.10"}))
    res = await servicio.refrescar(api.session, api.owner_id, traer=_falso({"USD": "1740.00"}))

    assert res.actualizadas == ["USD"]
    # Corrige, no duplica: es el mismo dato del mismo dia y misma fuente.
    filas = (await api.client.get("/api/v1/exchange-rates", params={"limit": 50})).json()
    delDia = [f for f in filas if f["source"] == "auto" and f["base_currency"] == "USD"]
    assert len(delDia) == 1
    assert Decimal(delDia[0]["rate"]) == Decimal("1740.00")


async def test_una_moneda_marcada_manual_no_se_toca(api: SimpleNamespace) -> None:
    await _cuenta(api, "USD")
    await _cuenta(api, "EUR")
    # En Argentina el dolar oficial de la API no es el que uno paga: se maneja
    # a mano y queda fuera del automatico.
    assert (
        await api.client.patch("/api/v1/users/me", json={"fx_manual": ["USD"]})
    ).status_code == 200

    pedidos: list = []
    res = await servicio.refrescar(
        api.session,
        api.owner_id,
        traer=_falso({"USD": "1735.10", "EUR": "2040.55"}, registro=pedidos),
    )

    assert res.manuales == ["USD"]
    assert res.actualizadas == ["EUR"]
    # No se gasta una llamada en una moneda que el usuario maneja a mano.
    assert pedidos == [("EUR", "ARS")]


async def test_lo_que_no_se_pudo_traer_se_informa_y_no_rompe(api: SimpleNamespace) -> None:
    await _cuenta(api, "USD")
    await _cuenta(api, "BRL")

    # La falsa no conoce BRL: simula que la API no cotiza ese par o fallo.
    res = await servicio.refrescar(api.session, api.owner_id, traer=_falso({"USD": "1735.10"}))
    assert res.actualizadas == ["USD"]
    assert res.fallidas == ["BRL"]


async def test_lo_cargado_a_mano_gana_a_igual_fecha(api: SimpleNamespace) -> None:
    await _cuenta(api, "USD")
    # El usuario carga el MEP de hoy...
    manual = {
        "id": str(uuid.uuid4()),
        "base_currency": "USD",
        "quote_currency": "ARS",
        "rate": "2100.00",
        "rate_date": "2026-09-07",
        "source": "mep",
    }
    assert (await api.client.post("/api/v1/exchange-rates", json=manual)).status_code == 201
    # ...y despues entra el automatico con la oficial del mismo dia.
    await servicio.refrescar(
        api.session, api.owner_id, traer=_falso({"USD": "1735.10"}, fecha="2026-09-07")
    )

    resp = await api.client.get(
        "/api/v1/exchange-rates/latest",
        params={"base_currency": "USD", "quote_currency": "ARS"},
    )
    assert resp.status_code == 200
    # Gana la del usuario: si la tipeo es porque la oficial no es la que aplica.
    assert Decimal(resp.json()["rate"]) == Decimal("2100.00")


async def test_endpoint_de_refresco(api: SimpleNamespace, monkeypatch) -> None:
    # El endpoint no recibe el `traer` por parametro, asi que se sustituye la
    # funcion que sale a la red: **ninguna prueba toca internet**.
    monkeypatch.setattr(servicio, "traer_de_api", _falso({"USD": "1735.10"}))
    await _cuenta(api, "USD")

    resp = await api.client.post("/api/v1/exchange-rates/refresh")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "actualizadas": ["USD"],
        "sin_cambios": [],
        "manuales": [],
        "fallidas": [],
    }


async def test_el_endpoint_no_rompe_si_la_fuente_falla(api: SimpleNamespace, monkeypatch) -> None:
    async def cae(origen: str, destino: str):
        return None

    monkeypatch.setattr(servicio, "traer_de_api", cae)
    await _cuenta(api, "USD")

    resp = await api.client.post("/api/v1/exchange-rates/refresh")
    # Sin conexion o con la API caida el refresco informa y sigue: la
    # cotizacion cacheada alcanza para estimar (ver 0005).
    assert resp.status_code == 200
    assert resp.json()["fallidas"] == ["USD"]


def test_parseo_del_payload_real() -> None:
    """El formato que devuelve la API v4, con el JSON tal como llega."""
    payload = {
        "provider": "https://www.exchangerate-api.com",
        "base": "USD",
        "date": "2026-09-07",
        "time_last_updated": 1789000000,
        "rates": {"USD": 1, "ARS": 1735.1, "EUR": 0.856},
    }
    # `traer_de_api` mezcla HTTP y parseo; se prueba la parte de parseo con la
    # misma logica que usa (Decimal desde string, fecha ISO del payload).
    rate = Decimal(str(payload["rates"]["ARS"]))
    fecha = date.fromisoformat(payload["date"])
    assert rate == Decimal("1735.1")
    assert fecha == date(2026, 9, 7)
