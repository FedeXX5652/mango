"""Deudas y prestamos (fase 5)."""

import uuid
from types import SimpleNamespace


def _payload(**over) -> dict:
    base = {
        "id": str(uuid.uuid4()),
        "direction": "receivable",
        "counterparty": "Juan",
        "amount": 50000,
        "currency": "ARS",
    }
    base.update(over)
    return base


async def test_crear_deuda(api: SimpleNamespace) -> None:
    r = await api.client.post("/api/v1/debts", json=_payload())
    assert r.status_code == 201, r.text
    assert r.json()["amount_settled"] == 0
    assert r.json()["settled_at"] is None


async def test_saldar_parcial_y_total(api: SimpleNamespace) -> None:
    d = (await api.client.post("/api/v1/debts", json=_payload(amount=50000))).json()
    parcial = await api.client.patch(f"/api/v1/debts/{d['id']}", json={"amount_settled": 20000})
    assert parcial.json()["settled_at"] is None  # todavia debe
    total = await api.client.patch(f"/api/v1/debts/{d['id']}", json={"amount_settled": 50000})
    assert total.json()["settled_at"] is not None  # saldada


async def test_no_se_salda_de_mas(api: SimpleNamespace) -> None:
    d = (await api.client.post("/api/v1/debts", json=_payload(amount=50000))).json()
    r = await api.client.patch(f"/api/v1/debts/{d['id']}", json={"amount_settled": 60000})
    assert r.status_code == 422
    assert "superar" in r.json()["detail"]


async def test_borrar_deuda(api: SimpleNamespace) -> None:
    d = (await api.client.post("/api/v1/debts", json=_payload())).json()
    assert (await api.client.delete(f"/api/v1/debts/{d['id']}")).status_code == 204
