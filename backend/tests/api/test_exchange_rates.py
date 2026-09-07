"""API de cotizaciones (ver decision 0005).

`rate` viaja como string en JSON: es un `Decimal` y no puede pasar por float sin
perder digitos. Al volver de la base trae la escala de la columna
(`NUMERIC(20,10)`), asi que "1735.10" vuelve como "1735.1000000000": las pruebas
comparan `Decimal`, no strings.

OJO con el aislamiento: la tabla **no tiene `owner_id`** (una cotizacion es un
dato de mercado, no del usuario), asi que el truco del fixture —un usuario
fresco por prueba— no la aisla. Las filas ya commiteadas de la base de dev se
ven. Por eso ninguna prueba asume la tabla vacia: filtra por su propio par y
rango, o verifica una propiedad del contrato (el orden) en vez de una lista
exacta.
"""

import uuid
from decimal import Decimal


def _fx(**over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "base_currency": "USD",
        "quote_currency": "ARS",
        "rate": "1735.10",
        "rate_date": "2026-09-06",
        "source": "oficial",
    }
    base.update(over)
    return base


async def test_alta_y_lectura(api):
    resp = await api.client.post("/api/v1/exchange-rates", json=_fx())
    assert resp.status_code == 201, resp.text
    creada = resp.json()
    assert creada["base_currency"] == "USD"
    assert creada["quote_currency"] == "ARS"
    assert creada["source"] == "oficial"

    resp = await api.client.get(f"/api/v1/exchange-rates/{creada['id']}")
    assert resp.status_code == 200
    assert resp.json()["rate_date"] == "2026-09-06"


async def test_no_pierde_decimales(api):
    # 10 decimales es el maximo de la columna: tienen que volver enteros.
    resp = await api.client.post("/api/v1/exchange-rates", json=_fx(rate="1734.9746835443"))
    assert resp.status_code == 201, resp.text
    assert Decimal(resp.json()["rate"]) == Decimal("1734.9746835443")


async def test_una_moneda_no_se_cotiza_contra_si_misma(api):
    resp = await api.client.post(
        "/api/v1/exchange-rates", json=_fx(base_currency="ARS", quote_currency="ARS")
    )
    assert resp.status_code == 422


async def test_cotizacion_cero_o_negativa_se_rechaza(api):
    assert (await api.client.post("/api/v1/exchange-rates", json=_fx(rate="0"))).status_code == 422
    assert (await api.client.post("/api/v1/exchange-rates", json=_fx(rate="-5"))).status_code == 422


async def test_duplicado_de_par_fecha_y_fuente(api):
    assert (await api.client.post("/api/v1/exchange-rates", json=_fx())).status_code == 201
    resp = await api.client.post("/api/v1/exchange-rates", json=_fx())
    assert resp.status_code == 422
    assert "Ya hay una cotizacion" in resp.json()["detail"]


async def test_dos_fuentes_para_el_mismo_dia_conviven(api):
    # En Argentina conviven oficial, MEP y tarjeta: el mismo par y dia con
    # fuente distinta son dos cotizaciones distintas.
    assert (
        await api.client.post("/api/v1/exchange-rates", json=_fx(source="oficial"))
    ).status_code == 201
    assert (
        await api.client.post("/api/v1/exchange-rates", json=_fx(source="mep"))
    ).status_code == 201


async def test_borrado_logico_libera_el_par(api):
    creada = (await api.client.post("/api/v1/exchange-rates", json=_fx())).json()
    assert (await api.client.delete(f"/api/v1/exchange-rates/{creada['id']}")).status_code == 204
    # Ya no se lee...
    assert (await api.client.get(f"/api/v1/exchange-rates/{creada['id']}")).status_code == 404
    # ...y el par queda libre para volver a cargarlo (indice unico parcial, 0003).
    assert (await api.client.post("/api/v1/exchange-rates", json=_fx())).status_code == 201


async def test_correccion_de_un_dedazo(api):
    creada = (await api.client.post("/api/v1/exchange-rates", json=_fx(rate="17351.00"))).json()
    resp = await api.client.patch(
        f"/api/v1/exchange-rates/{creada['id']}", json={"rate": "1735.10"}
    )
    assert resp.status_code == 200, resp.text
    assert Decimal(resp.json()["rate"]) == Decimal("1735.10")


async def test_ultima_conocida_no_es_la_del_dia(api):
    # La serie tiene huecos: "la ultima conocida" es la mas reciente <= fecha.
    for fecha, valor in [("2026-09-01", "1700.00"), ("2026-09-04", "1730.00")]:
        assert (
            await api.client.post("/api/v1/exchange-rates", json=_fx(rate=valor, rate_date=fecha))
        ).status_code == 201

    resp = await api.client.get(
        "/api/v1/exchange-rates/latest",
        params={"base_currency": "usd", "quote_currency": "ars", "as_of": "2026-09-06"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["rate_date"] == "2026-09-04"

    # A una fecha anterior al primer dato no hay nada que devolver.
    resp = await api.client.get(
        "/api/v1/exchange-rates/latest",
        params={"base_currency": "USD", "quote_currency": "ARS", "as_of": "2026-08-31"},
    )
    assert resp.status_code == 404


async def test_ultima_conocida_por_fuente(api):
    assert (
        await api.client.post(
            "/api/v1/exchange-rates",
            json=_fx(rate="1735.10", rate_date="2026-09-06", source="oficial"),
        )
    ).status_code == 201
    assert (
        await api.client.post(
            "/api/v1/exchange-rates",
            json=_fx(rate="2100.00", rate_date="2026-09-05", source="mep"),
        )
    ).status_code == 201

    resp = await api.client.get(
        "/api/v1/exchange-rates/latest",
        params={"base_currency": "USD", "quote_currency": "ARS", "source": "mep"},
    )
    assert resp.status_code == 200
    assert Decimal(resp.json()["rate"]) == Decimal("2100.00")


async def test_listado_filtra_por_par_y_rango(api):
    for fecha in ["2026-09-01", "2026-09-04", "2026-09-06"]:
        await api.client.post("/api/v1/exchange-rates", json=_fx(rate="1700.00", rate_date=fecha))
    await api.client.post(
        "/api/v1/exchange-rates",
        json=_fx(base_currency="EUR", rate="2000.00", rate_date="2026-09-04"),
    )

    resp = await api.client.get(
        "/api/v1/exchange-rates",
        params={
            "base_currency": "USD",
            "quote_currency": "ARS",
            "desde": "2026-09-02",
            "hasta": "2026-09-05",
        },
    )
    assert resp.status_code == 200
    fechas = [r["rate_date"] for r in resp.json()]
    assert fechas == ["2026-09-04"]

    # Y el listado viene de la fecha mas nueva a la mas vieja, con las dos del
    # mismo dia conviviendo (pares distintos).
    resp = await api.client.get(
        "/api/v1/exchange-rates", params={"desde": "2026-09-01", "hasta": "2026-09-06"}
    )
    fechas = [r["rate_date"] for r in resp.json()]
    assert fechas == sorted(fechas, reverse=True)
    assert fechas.count("2026-09-04") >= 2


async def test_inexistente_da_404(api):
    faltante = str(uuid.uuid4())
    assert (await api.client.get(f"/api/v1/exchange-rates/{faltante}")).status_code == 404
    assert (
        await api.client.patch(f"/api/v1/exchange-rates/{faltante}", json={"rate": "1"})
    ).status_code == 404
    assert (await api.client.delete(f"/api/v1/exchange-rates/{faltante}")).status_code == 404
