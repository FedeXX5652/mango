"""API de reglas recurrentes (Inc 9): generacion y avance de next_run_date."""

import uuid
from types import SimpleNamespace


async def _account(api: SimpleNamespace) -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Cuenta", "type": "bank", "currency": "ARS"},
    )
    return resp.json()["id"]


async def _category(api: SimpleNamespace, kind: str = "expense") -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Cat", "kind": kind},
    )
    return resp.json()["id"]


async def _rule(api: SimpleNamespace, **over) -> dict:
    acc = over.pop("account_id", None) or await _account(api)
    base = {
        "id": str(uuid.uuid4()),
        "name": "Alquiler",
        "kind": "expense",
        "account_id": acc,
        "amount": 500000,
        "currency": "ARS",
        "frequency": "monthly",
        "start_date": "2026-06-01",
        "next_run_date": "2026-06-01",
    }
    base.update(over)
    resp = await api.client.post("/api/v1/recurring", json=base)
    return resp


async def test_create_recurring_expense(api: SimpleNamespace) -> None:
    cat = await _category(api)
    resp = await _rule(api, category_id=cat)
    assert resp.status_code == 201, resp.text
    assert resp.json()["frequency"] == "monthly"


async def test_recurring_expense_requires_category(api: SimpleNamespace) -> None:
    resp = await _rule(api)  # sin category_id
    assert resp.status_code == 422
    assert "categoria" in resp.json()["detail"].lower()
