"""API de plantillas (Inc 9): materializar de un toque."""

import uuid
from types import SimpleNamespace


async def _account(api: SimpleNamespace) -> str:
    resp = await api.client.post(
        "/api/v1/accounts",
        json={"id": str(uuid.uuid4()), "name": "Cuenta", "type": "cash", "currency": "ARS"},
    )
    return resp.json()["id"]


async def _category(api: SimpleNamespace, kind: str = "expense") -> str:
    resp = await api.client.post(
        "/api/v1/categories",
        json={"id": str(uuid.uuid4()), "name": "Cat", "kind": kind},
    )
    return resp.json()["id"]


async def _template(api: SimpleNamespace, **over) -> dict:
    base = {"id": str(uuid.uuid4()), "name": "Cafe", "kind": "expense"}
    base.update(over)
    resp = await api.client.post("/api/v1/templates", json=base)
    assert resp.status_code == 201, resp.text
    return resp.json()


def _apply(**over) -> dict:
    base = {"id": str(uuid.uuid4()), "occurred_at": "2026-08-15T09:00:00-03:00"}
    base.update(over)
    return base


async def test_create_template(api: SimpleNamespace) -> None:
    acc = await _account(api)
    cat = await _category(api)
    body = await _template(api, account_id=acc, category_id=cat, amount=1500, currency="ARS")
    assert body["amount"] == 1500
    assert body["kind"] == "expense"
