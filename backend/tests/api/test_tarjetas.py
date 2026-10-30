"""La tarjeta de credito es una cuenta (0034): sus datos, su saldo en otra
moneda, las compras en cuotas y el "Avisarme" que sigue a la cuenta.

Toda regla rechazada tiene que ser un 422 del CRUD: un error de la base llega al
cliente como 409, que el conector toma por "ya aplicado", y la escritura se
perderia sin aviso.
"""

import uuid
from types import SimpleNamespace

from sqlalchemy import text

from app.models.user import User

OCCURRED = "2026-10-26T12:00:00-03:00"


async def _cuenta(api: SimpleNamespace, **over) -> dict:
    datos = {"id": str(uuid.uuid4()), "name": "Visa", "type": "credit_card", "currency": "ARS"}
    datos.update(over)
    r = await api.client.post("/api/v1/accounts", json=datos)
    assert r.status_code == 201, r.text
    return r.json()


async def _categoria(api: SimpleNamespace, kind: str = "expense") -> str:
    datos = {"id": str(uuid.uuid4()), "name": f"Cat {kind}", "kind": kind}
    r = await api.client.post("/api/v1/categories", json=datos)
    assert r.status_code == 201, r.text
    return datos["id"]


async def _gasto(api: SimpleNamespace, cuenta: str, cat: str, **over):
    datos = {
        "id": str(uuid.uuid4()),
        "kind": "expense",
        "occurred_at": OCCURRED,
        "amount": 600000,
        "currency": "ARS",
        "account_id": cuenta,
        "category_id": cat,
    }
    datos.update(over)
    return await api.client.post("/api/v1/transactions", json=datos)


# --- La tarjeta y sus datos --------------------------------------------------------


async def test_la_tarjeta_guarda_sus_datos(api: SimpleNamespace) -> None:
    visa = await _cuenta(
        api, brand="Visa", last4="1234", closing_day=24, due_day=5, credit_limit=150000000
    )
    fila = await api.fila("accounts", visa["id"])
    assert (fila["brand"], fila["last4"], fila["closing_day"], fila["due_day"]) == (
        "Visa",
        "1234",
        24,
        5,
    )
    assert fila["credit_limit"] == 150000000


async def test_datos_de_tarjeta_en_otra_cuenta_se_rechazan(api: SimpleNamespace) -> None:
    r = await api.client.post(
        "/api/v1/accounts",
        json={
            "id": str(uuid.uuid4()),
            "name": "Banco",
            "type": "bank",
            "currency": "ARS",
            "due_day": 5,
        },
    )
    assert r.status_code == 422
    assert "tarjeta de crédito" in r.json()["detail"]


async def test_formato_de_los_datos(api: SimpleNamespace) -> None:
    base = {"name": "Visa", "type": "credit_card", "currency": "ARS"}
    for malo in ({"last4": "12a4"}, {"last4": "123"}, {"closing_day": 32}, {"credit_limit": -1}):
        r = await api.client.post(
            "/api/v1/accounts", json={"id": str(uuid.uuid4()), **base, **malo}
        )
        assert r.status_code == 422, malo


async def test_deja_de_ser_tarjeta_y_pierde_sus_datos(api: SimpleNamespace) -> None:
    # Lo que manda un cliente 1.10, que no sabe de los datos: no se rechaza.
    visa = await _cuenta(api, brand="Visa", due_day=5)
    r = await api.client.patch(f"/api/v1/accounts/{visa['id']}", json={"type": "bank"})
    assert r.status_code == 200, r.text
    fila = await api.fila("accounts", visa["id"])
    assert fila["type"] == "bank" and fila["brand"] is None and fila["due_day"] is None


# --- Un saldo por moneda -----------------------------------------------------------


async def test_saldo_en_dolares_de_una_tarjeta(api: SimpleNamespace) -> None:
    visa = await _cuenta(api, closing_day=24, due_day=5)
    usd = await _cuenta(api, name="Visa USD", currency="USD", parent_account_id=visa["id"])
    assert usd["parent_account_id"] == visa["id"]


async def test_reglas_del_saldo_en_otra_moneda(api: SimpleNamespace) -> None:
    visa = await _cuenta(api)
    hijo = {"type": "credit_card", "parent_account_id": visa["id"]}

    async def crear(**over):
        datos = {"id": str(uuid.uuid4()), "name": "Saldo", "currency": "USD", **hijo, **over}
        return await api.client.post("/api/v1/accounts", json=datos)

    # Misma moneda que la tarjeta.
    assert (await crear(currency="ARS")).status_code == 422
    # Datos propios: los hereda de la tarjeta.
    r = await crear(due_day=5)
    assert r.status_code == 422 and "usa los datos" in r.json()["detail"]
    # Otro tipo de cuenta.
    assert (await crear(type="bank")).status_code == 422
    # Bien, y despues un segundo saldo en la misma moneda: no.
    assert (await crear()).status_code == 201
    r = await crear()
    assert r.status_code == 422 and "ya tiene un saldo en USD" in r.json()["detail"]


async def test_saldo_de_un_saldo_no(api: SimpleNamespace) -> None:
    visa = await _cuenta(api)
    usd = await _cuenta(api, currency="USD", parent_account_id=visa["id"])
    r = await api.client.post(
        "/api/v1/accounts",
        json={
            "id": str(uuid.uuid4()),
            "name": "Saldo",
            "type": "credit_card",
            "currency": "EUR",
            "parent_account_id": usd["id"],
        },
    )
    assert r.status_code == 422


async def test_saldo_de_una_tarjeta_ajena_no(api: SimpleNamespace) -> None:
    otro = User(
        id=uuid.uuid4(), username=f"otro-{uuid.uuid4()}", password_hash="!", display_name="Otro"
    )
    api.session.add(otro)
    await api.session.flush()
    ajena = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO accounts (id, owner_id, name, type, currency)"
            " VALUES (:id, :o, 'Ajena', 'credit_card', 'ARS')"
        ),
        {"id": str(ajena), "o": str(otro.id)},
    )
    r = await api.client.post(
        "/api/v1/accounts",
        json={
            "id": str(uuid.uuid4()),
            "name": "Saldo",
            "type": "credit_card",
            "currency": "USD",
            "parent_account_id": str(ajena),
        },
    )
    assert r.status_code == 422 and r.json()["detail"] == "La tarjeta no existe"


async def test_la_tarjeta_no_cambia_a_la_moneda_de_su_saldo(api: SimpleNamespace) -> None:
    visa = await _cuenta(api)
    await _cuenta(api, currency="USD", parent_account_id=visa["id"])
    r = await api.client.patch(f"/api/v1/accounts/{visa['id']}", json={"currency": "USD"})
    assert r.status_code == 422


async def test_con_saldo_en_otra_moneda_no_deja_de_ser_tarjeta(api: SimpleNamespace) -> None:
    visa = await _cuenta(api)
    await _cuenta(api, currency="USD", parent_account_id=visa["id"])
    r = await api.client.patch(f"/api/v1/accounts/{visa['id']}", json={"type": "bank"})
    assert r.status_code == 422 and "saldo en otra moneda" in r.json()["detail"]


async def test_el_saldo_se_archiva_y_se_borra_con_su_tarjeta(api: SimpleNamespace) -> None:
    visa = await _cuenta(api)
    usd = await _cuenta(api, currency="USD", parent_account_id=visa["id"])
    r = await api.client.patch(f"/api/v1/accounts/{visa['id']}", json={"archived": True})
    assert r.status_code == 200
    assert (await api.fila("accounts", usd["id"]))["archived"] is True
    r = await api.client.patch(f"/api/v1/accounts/{visa['id']}", json={"archived": False})
    assert (await api.fila("accounts", usd["id"]))["archived"] is False
    assert (await api.client.delete(f"/api/v1/accounts/{visa['id']}")).status_code == 204
    assert (await api.fila("accounts", usd["id"]))["deleted_at"] is not None


# --- Cuotas ------------------------------------------------------------------------


async def test_gasto_en_cuotas_con_tarjeta(api: SimpleNamespace) -> None:
    visa = await _cuenta(api)
    cat = await _categoria(api)
    # Monto grande: las cuotas no tocan el monto, que sigue exacto en centavos.
    r = await _gasto(api, visa["id"], cat, amount=9_007_199_254_740_991, installments=6)
    assert r.status_code == 201, r.text
    fila = await api.fila("transactions", r.json()["id"])
    assert fila["installments"] == 6 and fila["amount"] == 9_007_199_254_740_991


async def test_una_cuota_es_sin_cuotas(api: SimpleNamespace) -> None:
    visa = await _cuenta(api)
    r = await _gasto(api, visa["id"], await _categoria(api), installments=1)
    assert r.status_code == 201
    assert (await api.fila("transactions", r.json()["id"]))["installments"] is None


async def test_cuotas_fuera_de_un_gasto_con_tarjeta(api: SimpleNamespace) -> None:
    banco = await _cuenta(api, name="Banco", type="bank")
    visa = await _cuenta(api)
    r = await _gasto(api, banco["id"], await _categoria(api), installments=3)
    assert r.status_code == 422 and "tarjeta de crédito" in r.json()["detail"]
    r = await _gasto(
        api, visa["id"], await _categoria(api, "income"), kind="income", installments=3
    )
    assert r.status_code == 422
    r = await _gasto(api, visa["id"], await _categoria(api), installments=100)
    assert r.status_code == 422


async def test_cambiar_la_cuenta_saca_las_cuotas(api: SimpleNamespace) -> None:
    # Un cliente 1.10 que mueve el gasto a otra cuenta no sabe de cuotas: no se
    # rechaza el cambio, se sacan.
    visa = await _cuenta(api)
    banco = await _cuenta(api, name="Banco", type="bank")
    r = await _gasto(api, visa["id"], await _categoria(api), installments=3)
    tx = r.json()["id"]
    r = await api.client.patch(f"/api/v1/transactions/{tx}", json={"account_id": banco["id"]})
    assert r.status_code == 200, r.text
    assert (await api.fila("transactions", tx))["installments"] is None
    # Pedidas a mano en una cuenta que no es tarjeta, si se rechazan.
    r = await api.client.patch(f"/api/v1/transactions/{tx}", json={"installments": 3})
    assert r.status_code == 422


# --- "Avisarme" sigue a la cuenta ---------------------------------------------------


async def _avisarme(api: SimpleNamespace, **over):
    datos = {
        "id": str(uuid.uuid4()),
        "title": "Visa",
        "freq": "monthly",
        "month_mode": "day",
        "month_day": 5,
        "start_date": "2026-11-05",
        "weekend_shift": "next",
        "track_from": "2026-10-30",
    }
    datos.update(over)
    return await api.client.post("/api/v1/reminders", json=datos)


async def test_avisarme_sigue_a_la_cuenta_de_la_tarjeta(api: SimpleNamespace) -> None:
    visa = await _cuenta(api, due_day=5)
    r = await _avisarme(api, account_id=visa["id"])
    assert r.status_code == 201, r.text
    rec = r.json()["id"]
    assert (await api.fila("reminders", rec))["account_id"] == visa["id"]
    # Otro dia de vencimiento: el recordatorio lo sigue.
    await api.client.patch(f"/api/v1/accounts/{visa['id']}", json={"due_day": 10})
    assert (await api.fila("reminders", rec))["month_day"] == 10
    # Archivada, el recordatorio se va.
    await api.client.patch(f"/api/v1/accounts/{visa['id']}", json={"archived": True})
    assert (await api.fila("reminders", rec))["deleted_at"] is not None


async def test_sin_dia_de_vencimiento_el_avisarme_se_va(api: SimpleNamespace) -> None:
    # Sin dia de vencimiento, el recordatorio no tiene a que seguir: no puede
    # quedar avisando el dia viejo.
    visa = await _cuenta(api, due_day=5)
    rec = (await _avisarme(api, account_id=visa["id"])).json()["id"]
    r = await api.client.patch(f"/api/v1/accounts/{visa['id']}", json={"due_day": None})
    assert r.status_code == 200, r.text
    assert (await api.fila("reminders", rec))["deleted_at"] is not None


async def test_avisarme_de_una_cuenta_que_no_es_tarjeta_queda_suelto(api: SimpleNamespace) -> None:
    banco = await _cuenta(api, name="Banco", type="bank")
    r = await _avisarme(api, account_id=banco["id"])
    assert r.status_code == 201
    assert (await api.fila("reminders", r.json()["id"]))["account_id"] is None


async def test_avisarme_sigue_a_una_sola_cosa(api: SimpleNamespace) -> None:
    visa = await _cuenta(api)
    deuda = {
        "id": str(uuid.uuid4()),
        "direction": "payable",
        "counterparty": "Beto",
        "amount": 50000,
        "currency": "ARS",
        "due_date": "2026-11-20",
    }
    assert (await api.client.post("/api/v1/debts", json=deuda)).status_code == 201
    r = await _avisarme(api, account_id=visa["id"], debt_id=deuda["id"])
    assert r.status_code == 422


async def test_borrar_la_tarjeta_borra_su_avisarme(api: SimpleNamespace) -> None:
    visa = await _cuenta(api, due_day=5)
    rec = (await _avisarme(api, account_id=visa["id"])).json()["id"]
    assert (await api.client.delete(f"/api/v1/accounts/{visa['id']}")).status_code == 204
    assert (await api.fila("reminders", rec))["deleted_at"] is not None
