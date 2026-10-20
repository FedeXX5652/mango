"""DELETE idempotente (1.7.0): borrar dos veces da 204 las dos veces. Pasa cuando
dos dispositivos borran lo mismo sin conexion, o cuando la sync reintenta un
DELETE que ya se aplico; un 404 iria a "Rechazados" por algo que ya se hizo. Lo
de otra persona sigue en 404."""

import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import text

from app.api.deps import get_current_user_id
from app.main import app


def _id() -> str:
    return str(uuid.uuid4())


async def _cuenta(api: SimpleNamespace) -> str:
    cid = _id()
    r = await api.client.post(
        "/api/v1/accounts", json={"id": cid, "name": "Caja", "type": "cash", "currency": "ARS"}
    )
    assert r.status_code == 201, r.text
    return cid


async def _categoria(api: SimpleNamespace) -> str:
    cid = _id()
    r = await api.client.post(
        "/api/v1/categories", json={"id": cid, "name": f"Cat {cid[:6]}", "kind": "expense"}
    )
    assert r.status_code == 201, r.text
    return cid


async def _alta(api: SimpleNamespace, tabla: str) -> tuple[str, str]:
    """Crea una fila de `tabla` por la API y devuelve (ruta, id)."""
    rid = _id()
    if tabla == "accounts":
        return "/api/v1/accounts", await _cuenta(api)
    if tabla == "categories":
        return "/api/v1/categories", await _categoria(api)
    datos: dict
    ruta = f"/api/v1/{tabla}"
    if tabla == "payment-methods":
        datos = {"id": rid, "name": "Débito", "kind": "debit_card"}
    elif tabla == "tags":
        datos = {"id": rid, "name": f"etiqueta-{rid[:6]}"}
    elif tabla == "templates":
        datos = {"id": rid, "name": "Súper", "kind": "expense"}
    elif tabla == "goals":
        datos = {"id": rid, "name": "Vacaciones", "target_amount": 100000, "currency": "ARS"}
    elif tabla == "debts":
        datos = {
            "id": rid,
            "direction": "payable",
            "counterparty": "Beto",
            "amount": 5000,
            "currency": "ARS",
        }
    elif tabla == "transactions":
        datos = {
            "id": rid,
            "kind": "expense",
            "occurred_at": "2026-10-01T12:00:00-03:00",
            "amount": 1500,
            "currency": "ARS",
            "account_id": await _cuenta(api),
            "category_id": await _categoria(api),
        }
    elif tabla == "budgets":
        datos = {
            "id": rid,
            "category_id": await _categoria(api),
            "period_start": "2026-10-01",
            "amount": 50000,
            "currency": "ARS",
        }
    elif tabla == "budget-rules":
        datos = {
            "id": rid,
            "category_id": await _categoria(api),
            "amount": 50000,
            "currency": "ARS",
        }
    elif tabla == "recurring":
        datos = {
            "id": rid,
            "name": "Alquiler",
            "kind": "expense",
            "account_id": await _cuenta(api),
            "category_id": await _categoria(api),
            "amount": 50000,
            "currency": "ARS",
            "frequency": "monthly",
            "start_date": "2026-11-01",
            "next_run_date": "2026-11-01",
        }
    elif tabla == "exchange-rates":
        datos = {
            "id": rid,
            "base_currency": "USD",
            "quote_currency": "ARS",
            "rate": "1400",
            "rate_date": "2001-01-0" + str(1 + uuid.UUID(rid).int % 9),
            "source": f"prueba-{rid[:6]}",
        }
    else:  # pragma: no cover
        raise AssertionError(tabla)
    r = await api.client.post(ruta, json=datos)
    assert r.status_code == 201, (tabla, r.text)
    return ruta, rid


TABLAS = [
    "accounts",
    "categories",
    "payment-methods",
    "tags",
    "templates",
    "goals",
    "debts",
    "transactions",
    "budgets",
    "budget-rules",
    "recurring",
    "exchange-rates",
]


@pytest.mark.parametrize("tabla", TABLAS)
async def test_borrar_dos_veces_no_es_un_error(api: SimpleNamespace, tabla: str) -> None:
    ruta, rid = await _alta(api, tabla)
    assert (await api.client.delete(f"{ruta}/{rid}")).status_code == 204
    assert (await api.client.delete(f"{ruta}/{rid}")).status_code == 204


@pytest.mark.parametrize("tabla", ["accounts", "transactions", "templates", "debts"])
async def test_lo_de_otro_sigue_en_404(api: SimpleNamespace, tabla: str) -> None:
    ruta, rid = await _alta(api, tabla)
    await api.client.delete(f"{ruta}/{rid}")
    otro = uuid.uuid4()
    await api.session.execute(
        text(
            "INSERT INTO users (id, username, password_hash, display_name) "
            "VALUES (:id, :u, '!', 'Otro')"
        ),
        {"id": str(otro), "u": f"otro-{otro.hex[:6]}"},
    )
    await api.session.flush()
    antes = app.dependency_overrides[get_current_user_id]
    app.dependency_overrides[get_current_user_id] = lambda: otro
    try:
        assert (await api.client.delete(f"{ruta}/{rid}")).status_code == 404
    finally:
        app.dependency_overrides[get_current_user_id] = antes


async def test_la_asociacion_de_un_medio_se_borra_por_su_id(api: SimpleNamespace) -> None:
    """La cola de subida borra una asociacion medio -> cuenta solo con su id: antes
    iba siempre a "Rechazados" (el conector no sabia borrarla)."""
    pm = _id()
    await api.client.post(
        "/api/v1/payment-methods", json={"id": pm, "name": "Visa", "kind": "credit_card"}
    )
    pma = _id()
    r = await api.client.post(
        f"/api/v1/payment-methods/{pm}/accounts",
        json={"id": pma, "currency": "ARS", "account_id": await _cuenta(api)},
    )
    assert r.status_code == 201, r.text
    assert (await api.client.delete(f"/api/v1/payment-method-accounts/{pma}")).status_code == 204
    assert (await api.fila("payment_method_accounts", pma))["deleted_at"] is not None
    assert (await api.client.delete(f"/api/v1/payment-method-accounts/{pma}")).status_code == 204
    assert (await api.client.delete(f"/api/v1/payment-method-accounts/{_id()}")).status_code == 404
