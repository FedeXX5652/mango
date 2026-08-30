"""Export CSV de transacciones (Inc 10)."""

import csv
import io
import uuid
from types import SimpleNamespace

OCCURRED = "2026-08-15T12:00:00-03:00"


async def _account(api: SimpleNamespace, name: str = "Caja") -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": name, "type": "cash", "currency": "ARS"},
    )
    return resp.json()["id"]


async def _category(api: SimpleNamespace, name: str, kind: str = "expense") -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": name, "kind": kind},
    )
    return resp.json()["id"]


async def _tx(api: SimpleNamespace, **fields) -> None:
    payload = {"id": str(uuid.uuid4()), "occurred_at": OCCURRED, "currency": "ARS", **fields}
    resp = await api.client.post("/api/v1/transactions", json=payload)
    assert resp.status_code == 201, resp.text


def _rows(text: str) -> list[dict]:
    return list(csv.DictReader(io.StringIO(text)))


async def test_export_has_header_and_readable_amounts(api: SimpleNamespace) -> None:
    acc = await _account(api, "Caja")
    cat = await _category(api, "Comida", "expense")
    await _tx(api, kind="expense", amount=230272, account_id=acc, category_id=cat, payee="SUBE")

    resp = await api.client.get("/api/v1/transactions/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    assert "attachment" in resp.headers["content-disposition"]

    rows = _rows(resp.text)
    assert len(rows) == 1
    row = rows[0]
    assert row["monto"] == "2302.72"  # centavos -> decimal legible
    assert row["moneda"] == "ARS"
    assert row["cuenta"] == "Caja"
    assert row["categoria"] == "Comida"
    assert row["comercio"] == "SUBE"
    assert row["tipo"] == "expense"
    assert row["estado"] == "confirmed"


async def test_export_amount_formatting_small(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api, "Ingresos", "income")
    await _tx(api, kind="income", amount=5, account_id=acc, category_id=cat)
    rows = _rows((await api.client.get("/api/v1/transactions/export")).text)
    assert rows[0]["monto"] == "0.05"


async def test_export_respects_kind_filter(api: SimpleNamespace) -> None:
    acc = await _account(api)
    exp = await _category(api, "Gasto", "expense")
    inc = await _category(api, "Sueldo", "income")
    await _tx(api, kind="expense", amount=1000, account_id=acc, category_id=exp)
    await _tx(api, kind="income", amount=2000, account_id=acc, category_id=inc)

    rows = _rows(
        (await api.client.get("/api/v1/transactions/export", params={"kind": "expense"})).text
    )
    assert len(rows) == 1
    assert rows[0]["tipo"] == "expense"


async def test_export_transfer_has_destination(api: SimpleNamespace) -> None:
    origin = await _account(api, "Origen")
    dest = await _account(api, "Destino")
    await _tx(api, kind="transfer", amount=5000, account_id=origin, transfer_account_id=dest)
    rows = _rows((await api.client.get("/api/v1/transactions/export")).text)
    row = next(r for r in rows if r["tipo"] == "transfer")
    assert row["cuenta"] == "Origen"
    assert row["cuenta_destino"] == "Destino"
    assert row["categoria"] == ""


async def test_export_empty_is_just_header(api: SimpleNamespace) -> None:
    resp = await api.client.get("/api/v1/transactions/export")
    assert resp.status_code == 200
    assert _rows(resp.text) == []
    assert resp.text.splitlines()[0].startswith("fecha,tipo,monto")
