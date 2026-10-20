"""Cotizaciones automaticas (1.7.0, ver 0031): los dolares argentinos y el resto
contra el dolar, con su historia.

El servicio recibe las fuentes por parametro, asi que estas pruebas **no salen a
la red**. La tabla no tiene dueño: el fixture no la aisla y las filas de la base
de desarrollo se ven. Por eso se trabaja en fechas que la serie real nunca va a
tener (2031) y se mira solo lo de esas fechas.
"""

import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.services import fuentes_fx
from app.services import fx as servicio

HOY = date(2031, 5, 12)
DESDE = date(2031, 5, 1)
DIAS = [DESDE + timedelta(days=i) for i in range((HOY - DESDE).days + 1)]


@pytest.fixture(autouse=True)
def _sin_memoria():
    servicio.olvidar()
    yield
    servicio.olvidar()


class Falsas:
    """Fuentes falsas: responden con lo que se les cargo y anotan que se pidio.
    Con `caida`, ninguna contesta (como sin conexion)."""

    def __init__(self) -> None:
        self.caida = False
        self.dolares: dict[str, dict[date, Decimal]] = {
            casa: {d: Decimal(base) + i for i, d in enumerate(DIAS)}
            for casa, base in (("oficial", 1000), ("mep", 1500), ("blue", 1550), ("tarjeta", 1900))
        }
        self.bce: dict[date, dict[str, Decimal]] = {}
        self.bna: dict[str, dict[date, Decimal]] = {}
        self.ultimos: dict[str, tuple[date, dict[str, Decimal]]] = {}
        self.monedas_bce = frozenset({"EUR", "BRL", "MXN"})
        self.pedidos: list[tuple] = []

    def _contesta(self):
        if self.caida:
            raise fuentes_fx.SinRespuesta("caida")

    async def dolar_historia(self, casa):
        self._contesta()
        self.pedidos.append(("historia", casa))
        return sorted(self.dolares.get(casa, {}).items())

    async def dolar_dia(self, casa, fecha):
        self._contesta()
        self.pedidos.append(("dia", casa, fecha))
        return self.dolares.get(casa, {}).get(fecha)

    async def bna_historia(self, moneda):
        self._contesta()
        return sorted(self.bna.get(moneda, {}).items())

    async def bna_dia(self, moneda, fecha):
        self._contesta()
        return self.bna.get(moneda, {}).get(fecha)

    async def bce_monedas(self):
        self._contesta()
        return self.monedas_bce

    async def bce_serie(self, desde, hasta, monedas):
        self._contesta()
        self.pedidos.append(("bce", desde, hasta, tuple(monedas)))
        return {
            f: {m: v for m, v in d.items() if m in monedas}
            for f, d in self.bce.items()
            if desde <= f <= hasta
        }

    async def ultimo(self, base):
        self._contesta()
        return self.ultimos.get(base)


async def _serie(api: SimpleNamespace, base: str, quote: str, casa: str | None) -> dict:
    """{fecha: rate} de las automaticas de una serie, en las fechas de prueba."""
    filas = await api.session.execute(
        text(
            "SELECT rate_date, rate FROM exchange_rates WHERE base_currency = :b"
            " AND quote_currency = :q AND source = 'auto' AND casa IS NOT DISTINCT FROM :c"
            " AND deleted_at IS NULL AND rate_date >= :d"
        ),
        {"b": base, "q": quote, "c": casa, "d": DESDE},
    )
    return {f: r for f, r in filas.all()}


async def _correr(api, f: Falsas, *, hoy: date = HOY, monedas: set[str] = frozenset()):
    return await servicio.actualizar(
        api.session, hoy=hoy, desde=DESDE, monedas=set(monedas), fuentes=f
    )


# --- Los dolares ----------------------------------------------------------------


async def test_carga_la_historia_de_los_cuatro_dolares(api: SimpleNamespace) -> None:
    f = Falsas()
    inf = await _correr(api, f)
    for casa, base in (("oficial", 1000), ("mep", 1500), ("blue", 1550), ("tarjeta", 1900)):
        serie = await _serie(api, "USD", "ARS", casa)
        assert sorted(serie) == DIAS
        assert serie[HOY] == Decimal(base + len(DIAS) - 1)
    assert "USD" in inf.nuevas


async def test_despues_pide_solo_lo_del_dia(api: SimpleNamespace) -> None:
    f = Falsas()
    await _correr(api, f)
    manana = HOY + timedelta(days=1)
    for casa in f.dolares:
        f.dolares[casa][manana] = Decimal(2000)
    f.pedidos.clear()
    await _correr(api, f, hoy=manana)
    # De la ultima conocida (que puede haber cambiado) a hoy, sin la historia.
    assert sorted(p for p in f.pedidos if p[0] != "dia") == []
    assert {p[2] for p in f.pedidos} == {HOY, manana}
    assert (await _serie(api, "USD", "ARS", "mep"))[manana] == Decimal(2000)


async def test_el_valor_de_los_ultimos_dias_se_corrige_y_lo_viejo_no(api: SimpleNamespace) -> None:
    # El MEP se mueve durante el dia: lo de hoy se corrige si cambio. Lo viejo
    # es historia y no se toca aunque la fuente diga otra cosa.
    f = Falsas()
    await _correr(api, f)
    f.dolares["mep"][HOY] = Decimal("1777.7")
    f.dolares["mep"][DESDE] = Decimal("9")
    await _correr(api, f)
    serie = await _serie(api, "USD", "ARS", "mep")
    assert serie[HOY] == Decimal("1777.7")
    assert serie[DESDE] == Decimal(1500)


async def test_lo_cargado_a_mano_no_se_toca(api: SimpleNamespace) -> None:
    r = await api.client.post(
        "/api/v1/exchange-rates",
        json={
            "id": str(uuid.uuid4()),
            "base_currency": "USD",
            "quote_currency": "ARS",
            "rate": "1600",
            "rate_date": HOY.isoformat(),
        },
    )
    assert r.status_code == 201, r.text
    await _correr(api, Falsas())
    mano = (
        await api.session.execute(
            text("SELECT rate FROM exchange_rates WHERE id = :id"), {"id": r.json()["id"]}
        )
    ).scalar_one()
    assert mano == Decimal(1600)


# --- Las otras monedas, contra el dolar --------------------------------------------


async def test_las_del_bce_van_contra_el_dolar(api: SimpleNamespace) -> None:
    f = Falsas()
    f.bce = {d: {"EUR": Decimal("0.9"), "BRL": Decimal("5.1")} for d in DIAS}
    inf = await _correr(api, f, monedas={"EUR", "ARS", "USD"})
    serie = await _serie(api, "USD", "EUR", None)
    assert sorted(serie) == DIAS and serie[HOY] == Decimal("0.9")
    # Solo lo que se usa: el real no.
    assert await _serie(api, "USD", "BRL", None) == {}
    assert "EUR" in inf.nuevas


async def test_uyu_cruza_con_el_dolar_oficial_del_mismo_dia(api: SimpleNamespace) -> None:
    # El BCE no publica el peso uruguayo: el BNA si, contra el peso. 1 USD en
    # UYU sale de las dos del mismo dia: 1500 / 37,5 = 40.
    f = Falsas()
    f.bna = {"USD": {HOY: Decimal(1500)}, "UYU": {HOY: Decimal("37.5")}}
    await _correr(api, f, monedas={"UYU"})
    assert await _serie(api, "USD", "UYU", None) == {HOY: Decimal(40)}


async def test_lo_que_nadie_publica_con_historia_toma_el_ultimo_valor(api: SimpleNamespace) -> None:
    f = Falsas()
    f.ultimos = {
        "USD": (HOY, {"PYG": Decimal(7300), "KWD": Decimal("0.307")}),
        "KWD": (HOY, {"USD": Decimal("3.2573")}),
    }
    await _correr(api, f, monedas={"PYG", "KWD"})
    assert await _serie(api, "USD", "PYG", None) == {HOY: Decimal(7300)}
    # Con el numero chico la fuente pierde digitos (6 decimales fijos): se
    # guarda al reves, 1 KWD = 3,2573 USD.
    assert await _serie(api, "KWD", "USD", None) == {HOY: Decimal("3.2573")}


async def test_lo_que_no_se_pudo_traer_se_informa_y_no_rompe(api: SimpleNamespace) -> None:
    f = Falsas()
    f.caida = True
    inf = await _correr(api, f, monedas={"EUR", "UYU", "PYG"})
    assert inf.fallidas == {"USD", "EUR", "UYU", "PYG"}


async def test_un_dia_sin_publicar_no_es_una_falla(api: SimpleNamespace) -> None:
    # Al dia, el valor de hoy todavia no esta (la fuente da 404): no es "sin
    # respuesta", es que todavia no hay dato.
    f = Falsas()
    await _correr(api, f)
    manana = HOY + timedelta(days=1)
    inf = await _correr(api, f, hoy=manana)
    assert inf.fallidas == set()


async def test_desde_el_primer_movimiento_si_es_mas_viejo(api: SimpleNamespace) -> None:
    # Un movimiento de 2020 se tiene que poder convertir: la historia llega hasta
    # el mes de ese movimiento.
    acc = (
        await api.client.post(
            "/api/v1/accounts",
            json={"id": str(uuid.uuid4()), "name": "C", "type": "cash", "currency": "ARS"},
        )
    ).json()["id"]
    cat = (
        await api.client.post(
            "/api/v1/categories",
            json={"id": str(uuid.uuid4()), "name": "X", "kind": "expense"},
        )
    ).json()["id"]
    r = await api.client.post(
        "/api/v1/transactions",
        json={
            "id": str(uuid.uuid4()),
            "kind": "expense",
            "occurred_at": "2003-03-15T12:00:00-03:00",
            "amount": 100,
            "currency": "ARS",
            "account_id": acc,
            "category_id": cat,
        },
    )
    assert r.status_code == 201, r.text
    assert await servicio._desde(api.session, HOY) == date(2003, 3, 1)


# --- Lo que pide la app -------------------------------------------------------------


@pytest.fixture
def fuentes_falsas(monkeypatch) -> Falsas:
    """El endpoint no recibe las fuentes: se reemplazan las funciones que salen a
    la red. **Ninguna prueba toca internet**."""
    f = Falsas()
    hoy = servicio.hoy_local()
    for casa in f.dolares:
        f.dolares[casa] = {hoy: Decimal("1234.5"), hoy - timedelta(days=1): Decimal("1234.5")}
    for nombre in ("dolar_historia", "dolar_dia", "bna_historia", "bna_dia", "bce_monedas"):
        monkeypatch.setattr(fuentes_fx, nombre, getattr(f, nombre))
    monkeypatch.setattr(fuentes_fx, "bce_serie", f.bce_serie)
    monkeypatch.setattr(fuentes_fx, "ultimo", f.ultimo)
    return f


async def test_endpoint_de_refresco(api: SimpleNamespace, fuentes_falsas: Falsas) -> None:
    await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "D", "type": "bank", "currency": "USD"},
    )
    resp = await api.client.post("/api/v1/exchange-rates/refresh?forzar=true")
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "actualizadas": ["USD"],
        "sin_cambios": [],
        "manuales": [],
        "fallidas": [],
    }


async def test_al_abrir_no_sale_a_la_red_si_recien_se_hizo(
    api: SimpleNamespace, fuentes_falsas: Falsas
) -> None:
    await api.client.post("/api/v1/exchange-rates/refresh?forzar=true")
    fuentes_falsas.pedidos.clear()
    resp = await api.client.post("/api/v1/exchange-rates/refresh")
    assert resp.status_code == 200
    assert fuentes_falsas.pedidos == []


async def test_el_endpoint_no_rompe_si_la_fuente_falla(
    api: SimpleNamespace, fuentes_falsas: Falsas
) -> None:
    fuentes_falsas.caida = True
    await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "D", "type": "bank", "currency": "USD"},
    )
    resp = await api.client.post("/api/v1/exchange-rates/refresh?forzar=true")
    assert resp.status_code == 200
    assert resp.json()["fallidas"] == ["USD"]


# --- Las automaticas son del servidor ------------------------------------------------


async def test_el_cliente_no_crea_ni_toca_automaticas(api: SimpleNamespace) -> None:
    r = await api.client.post(
        "/api/v1/exchange-rates",
        json={
            "id": str(uuid.uuid4()),
            "base_currency": "USD",
            "quote_currency": "ARS",
            "rate": "1",
            "rate_date": HOY.isoformat(),
            "source": "auto",
        },
    )
    assert r.status_code == 422
    await _correr(api, Falsas())
    auto = (
        await api.session.execute(
            text(
                "SELECT id FROM exchange_rates WHERE source = 'auto' AND casa = 'mep'"
                " AND rate_date = :d AND deleted_at IS NULL"
            ),
            {"d": HOY},
        )
    ).scalar_one()
    assert (
        await api.client.patch(f"/api/v1/exchange-rates/{auto}", json={"rate": "2"})
    ).status_code == 422
    assert (await api.client.delete(f"/api/v1/exchange-rates/{auto}")).status_code == 422


# --- El dolar de cada moneda ---------------------------------------------------------


async def test_el_dolar_de_cada_moneda_se_guarda_en_el_usuario(api: SimpleNamespace) -> None:
    # Llega por la sync como texto con el JSON adentro, igual que fx_manual.
    r = await api.client.patch(
        f"/api/v1/users/{api.owner_id}", json={"fx_dolar": '{"USD": "mep", "EUR": "tarjeta"}'}
    )
    assert r.status_code == 200, r.text
    assert r.json()["fx_dolar"] == {"USD": "mep", "EUR": "tarjeta"}
    r = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"fx_dolar": {"USD": "ccl"}})
    assert r.status_code == 422
    r = await api.client.patch(f"/api/v1/users/{api.owner_id}", json={"fx_dolar": None})
    assert r.json()["fx_dolar"] is None
